import type {VercelRequest,VercelResponse} from '@vercel/node';
import {createHash} from 'node:crypto';
import {neon} from '@neondatabase/serverless';
import {S3Client,PutObjectCommand} from '@aws-sdk/client-s3';
import {PortalAuthError,requirePortalIdentity} from './lib/neon-identity.js';

const SOURCE='tyhszzztltamrohhyykh.supabase.co';
const PATH='/storage/v1/object/public/community-photos/';
const LIMIT=5*1024*1024;
const exts:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

async function readLegacyImage(raw:string):Promise<{data:Buffer;mime:string}> {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.hostname!==SOURCE||!url.pathname.startsWith(PATH)||
     url.port||url.username||url.password) throw new Error('Unapproved legacy image source');
  const response=await fetch(url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000)});
  const mime=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
  if(!response.ok||!response.body||!exts[mime]||
    Number(response.headers.get('content-length')||0)>LIMIT)throw new Error('Image unavailable or invalid');
  const reader=response.body.getReader();
  let size=0;
  const parts:Buffer[]=[];
  try {
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>LIMIT)throw new Error('Image exceeded maximum');
      parts.push(Buffer.from(value));
    }
  } finally {await reader.cancel().catch(()=>{});}
  const data=Buffer.concat(parts);
  const looksRight=mime==='image/jpeg' ? data[0]===255&&data[1]===216 :
     mime==='image/png' ? data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
     data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP';
  if(!looksRight)throw new Error('File did not pass image signature validation');
  return {data,mime};
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Unsupported method'});
  const {DATABASE_URL,AWS_ENDPOINT_URL_S3,AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,
    NEON_STORAGE_BUCKET,AWS_REGION}=process.env;
  if(!DATABASE_URL||!AWS_ENDPOINT_URL_S3||!AWS_ACCESS_KEY_ID||!AWS_SECRET_ACCESS_KEY||!NEON_STORAGE_BUCKET)
    return res.status(503).json({error:'Neon Storage is not configured'});
  try{
    const sql=neon(DATABASE_URL);
    const actor=await requirePortalIdentity(req,sql);
    const roles=await sql`SELECT role FROM public.community_admins WHERE user_id=${actor.id}::uuid LIMIT 1`;
    if(roles[0]?.role!=='owner')return res.status(403).json({error:'Owner access required'});
    const sources=await sql`SELECT url FROM (
        SELECT photo_url AS url FROM public.members
        UNION SELECT photo_url AS url FROM public.member_applications
        UNION SELECT photo_url AS url FROM public.community_management_profiles
        UNION SELECT photo_url AS url FROM public.community_admins
      ) links
      WHERE url LIKE 'https://tyhszzztltamrohhyykh.supabase.co/storage/v1/object/public/community-photos/%'
      ORDER BY url LIMIT 30`;
    if(req.body?.dry_run===true)return res.json({data:{pending:sources.length,migrated:0}});
    const endpoint=AWS_ENDPOINT_URL_S3.replace(/\/$/,'');
    const client=new S3Client({region:AWS_REGION||'ap-southeast-1',endpoint,forcePathStyle:true,
      credentials:{accessKeyId:AWS_ACCESS_KEY_ID,secretAccessKey:AWS_SECRET_ACCESS_KEY}});
    let migrated=0,failed=0;
    for(const record of sources){
      try{
        const previous=String(record.url);
        const {data,mime}=await readLegacyImage(previous);
        const key='legacy-official-images/'+createHash('sha256').update(previous).digest('hex')+'.'+exts[mime];
        await client.send(new PutObjectCommand({Bucket:NEON_STORAGE_BUCKET,Key:key,Body:data,
          ContentType:mime,CacheControl:'public, max-age=31536000, immutable'}));
        const next=endpoint+'/'+NEON_STORAGE_BUCKET+'/'+key;
        await Promise.all([
          sql`UPDATE public.members SET photo_url=${next} WHERE photo_url=${previous}`,
          sql`UPDATE public.member_applications SET photo_url=${next} WHERE photo_url=${previous}`,
          sql`UPDATE public.community_management_profiles SET photo_url=${next} WHERE photo_url=${previous}`,
          sql`UPDATE public.community_admins SET photo_url=${next} WHERE photo_url=${previous}`
        ]);
        migrated++;
      }catch{failed++;}
    }
    return res.json({data:{migrated,failed,note:'Only Neon records updated. Source public files unchanged.'}});
  }catch(error){
    if(error instanceof PortalAuthError)return res.status(error.status).json({error:error.message});
    return res.status(500).json({error:'Image migration could not be completed'});
  }
}
