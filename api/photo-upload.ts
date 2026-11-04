import type { VercelRequest,VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { randomUUID } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PortalAuthError, requirePortalIdentity } from './lib/neon-identity';

export default async function handler(req:VercelRequest,res:VercelResponse) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Method not supported.'});
  if(!process.env.DATABASE_URL || !process.env.AWS_ENDPOINT_URL_S3 ||
    !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY ||
    !process.env.NEON_STORAGE_BUCKET)
    return res.status(503).json({error:'Neon Storage is not configured.'});
  try{
    const sql=neon(process.env.DATABASE_URL);
    const user=await requirePortalIdentity(req,sql);
    const body=req.body&&typeof req.body==='object'?req.body:{};
    const kind=String(body.kind||'');
    const contentType=String(body.content_type||'');
    const bytes=Number(body.size);
    if(!['application','self','member','management','showcase'].includes(kind))
      return res.status(400).json({error:'Invalid upload category.'});
    const ext: Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    if(!Object.prototype.hasOwnProperty.call(ext,contentType)||!Number.isInteger(bytes)||bytes<100||bytes>5*1024*1024)
      return res.status(400).json({error:'Upload a JPEG, PNG or WebP picture under 5 MB.'});
    if(['member','management','showcase'].includes(kind)){
      const staff=await sql`SELECT role FROM community_admins WHERE user_id=${user.id}::uuid LIMIT 1`;
      if(!staff.length) return res.status(403).json({error:'Management access required.'});
    }
    const key='photos/'+user.id+'/'+kind+'/'+randomUUID()+'.'+ext[contentType];
    const bucket=process.env.NEON_STORAGE_BUCKET;
    const endpoint=process.env.AWS_ENDPOINT_URL_S3.replace(/\/$/,'');
    const s3=new S3Client({
      region:process.env.AWS_REGION||'ap-southeast-1',
      endpoint,
      forcePathStyle:true,
      credentials:{
        accessKeyId:process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey:process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    const put=new PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType,
      CacheControl:'public, max-age=31536000, immutable'});
    const uploadUrl=await getSignedUrl(s3,put,{expiresIn:120});
    return res.json({upload_url:uploadUrl,public_url:endpoint+'/'+bucket+'/'+key});
  }catch(error){
    if(error instanceof PortalAuthError)return res.status(error.status).json({error:error.message});
    console.error('Neon photo signing error',error);
    return res.status(500).json({error:'Unable to prepare the image upload.'});
  }
}
