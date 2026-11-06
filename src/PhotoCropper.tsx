import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import { Check, Image, RefreshCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import './photo-cropper.css';

const SIDE=300, OUTPUT=640;
type Offset={x:number;y:number};
type Props={file:File;title:string;onSave:(file:File)=>Promise<void>;onCancel:()=>void};
const limit=(v:number,b:number)=>Math.min(b,Math.max(-b,v));
export default function PhotoCropper({file,title,onSave,onCancel}:Props){
  const [url,setUrl]=useState('');
  const [dimensions,setDimensions]=useState<{width:number;height:number}|null>(null);
  const [zoom,setZoom]=useState(1);
  const [offset,setOffset]=useState<Offset>({x:0,y:0});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState('');
  const imageRef=useRef<HTMLImageElement|null>(null);
  const dragRef=useRef<{id:number;startX:number;startY:number;x:number;y:number;width:number}|null>(null);
  useEffect(()=>{
    const objectUrl=URL.createObjectURL(file),img=new window.Image();
    let active=true;
    setUrl(objectUrl);setDimensions(null);setZoom(1);setOffset({x:0,y:0});setError('');
    img.onload=()=>{if(active){imageRef.current=img;setDimensions({width:img.naturalWidth,height:img.naturalHeight});}};
    img.onerror=()=>{if(active)setError('Unable to read photo. Try a different JPG, PNG, or WebP image.');};
    img.src=objectUrl;
    return()=>{active=false;imageRef.current=null;URL.revokeObjectURL(objectUrl);};
  },[file]);
  useEffect(()=>{
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=overflow;};
  },[]);
  useEffect(()=>{
    const escape=(e:globalThis.KeyboardEvent)=>{if(e.key==='Escape'&&!saving)onCancel();};
    window.addEventListener('keydown',escape);
    return()=>window.removeEventListener('keydown',escape);
  },[saving,onCancel]);
  const base=dimensions?Math.max(SIDE/dimensions.width,SIDE/dimensions.height):1;
  const width=dimensions?dimensions.width*base*zoom:SIDE;
  const height=dimensions?dimensions.height*base*zoom:SIDE;
  const boundX=Math.max(0,(width-SIDE)/2),boundY=Math.max(0,(height-SIDE)/2);
  const x=limit(offset.x,boundX),y=limit(offset.y,boundY);
  const left=(SIDE-width)/2+x,top=(SIDE-height)/2+y;
  function updateZoom(value:number){
    if(!dimensions)return;
    const z=Math.max(1,Math.min(3,value));
    setZoom(z);
    setOffset(current=>({
      x:limit(current.x,Math.max(0,(dimensions.width*base*z-SIDE)/2)),
      y:limit(current.y,Math.max(0,(dimensions.height*base*z-SIDE)/2)),
    }));
  }
  function pointerDown(e:PointerEvent<HTMLDivElement>){
    if(saving||!dimensions||e.button!==0)return;
    dragRef.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,x,y,width:e.currentTarget.getBoundingClientRect().width||SIDE};
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function pointerMove(e:PointerEvent<HTMLDivElement>){
    const d=dragRef.current;
    if(!d||d.id!==e.pointerId)return;
    const ratio=SIDE/d.width;
    setOffset({x:limit(d.x+(e.clientX-d.startX)*ratio,boundX),y:limit(d.y+(e.clientY-d.startY)*ratio,boundY)});
  }
  function pointerEnd(e:PointerEvent<HTMLDivElement>){
    if(dragRef.current?.id===e.pointerId)dragRef.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  }
  function keyMove(e:KeyboardEvent<HTMLDivElement>){
    const delta:Record<string,Offset>={ArrowLeft:{x:-8,y:0},ArrowRight:{x:8,y:0},ArrowUp:{x:0,y:-8},ArrowDown:{x:0,y:8}};
    if(!dimensions||saving||!delta[e.key])return;
    e.preventDefault();
    setOffset(current=>({x:limit(current.x+delta[e.key].x,boundX),y:limit(current.y+delta[e.key].y,boundY)}));
  }
  async function confirm(){
    if(!dimensions||!imageRef.current||saving)return;
    setSaving(true);setError('');
    try{
      const canvas=document.createElement('canvas');canvas.width=OUTPUT;canvas.height=OUTPUT;
      const ctx=canvas.getContext('2d');
      if(!ctx)throw Error('Your browser cannot crop photos. Try another browser.');
      ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
      const k=OUTPUT/SIDE;
      ctx.drawImage(imageRef.current,left*k,top*k,width*k,height*k);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('Could not crop image.')),'image/jpeg',0.9));
      if(blob.size>5*1024*1024)throw Error('Photo exceeds 5 MB.');
      await onSave(new File([blob],file.name.replace(/\.[^/.]+$/,'')+'-cropped.jpg',{type:'image/jpeg'}));
    }catch(cause){setError(cause instanceof Error?cause.message:'Unable to save image.');}
    finally{setSaving(false);}
  }
  return <div className="asy-crop-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target&&!saving)onCancel();}}>
    <section role="dialog" aria-modal="true" aria-labelledby="asy-crop-title" className="asy-crop-dialog">
      <div className="asy-crop-heading">
        <div><span><Image size={14}/> PROFILE PHOTO</span><h3 id="asy-crop-title">{title}</h3><p>Drag to reposition your photo, then zoom until it looks right.</p></div>
        <button type="button" aria-label="Cancel cropping" className="asy-crop-close" onClick={onCancel} disabled={saving}><X size={18}/></button>
      </div>
      <div className="asy-crop-content">
        <div className="asy-crop-stage" tabIndex={0} role="img" aria-label="Crop preview. Drag to reposition or use arrow keys."
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd}
          onPointerCancel={pointerEnd} onKeyDown={keyMove}>
          {url&&dimensions&&<img draggable={false} alt="" className="asy-crop-image" src={url}
            style={{width:width/SIDE*100+'%',height:height/SIDE*100+'%',left:left/SIDE*100+'%',top:top/SIDE*100+'%'}}/>}
          {!dimensions&&<span className="asy-crop-loading">{error?'Photo unavailable':'Opening photo…'}</span>}
          <span className="asy-crop-guides" aria-hidden="true"/>
        </div>
        <div className="asy-crop-controls">
          <label htmlFor="asy-crop-zoom">Zoom <strong>{zoom.toFixed(1)}×</strong></label>
          <div className="asy-crop-range"><ZoomOut size={17}/><input id="asy-crop-zoom" type="range" min="1" max="3" step="0.05" value={zoom}
            disabled={saving||!dimensions} onChange={e=>updateZoom(Number(e.target.value))}/><ZoomIn size={17}/></div>
          <button type="button" className="asy-crop-reset" onClick={()=>{setZoom(1);setOffset({x:0,y:0});}} disabled={saving||!dimensions}>
            <RefreshCcw size={14}/> Reset position
          </button>
          <p>The square preview is how the photo will look in the member directory.</p>
        </div>
      </div>
      {error&&<p className="asy-crop-error" role="alert">{error}</p>}
      <div className="asy-crop-actions">
        <button type="button" className="asy-crop-cancel" disabled={saving} onClick={onCancel}>Cancel</button>
        <button type="button" className="asy-crop-submit" disabled={saving||!dimensions} onClick={()=>void confirm()}>
          <Check size={16}/>{saving?'Saving…':'Save cropped photo'}
        </button>
      </div>
    </section>
  </div>;
}