/* ASYLUM COMMUNITY PWA — never cache login, API responses or private dashboard records. */
const VERSION='asy-public-icons-v2';
const PUBLIC_ICONS=['/resources/asylum-community-logo.jpg','/resources/asylum-login-logo.svg','/icons/icon-192.svg','/icons/icon-512.svg','/icons/asylum-logo.webp','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(PUBLIC_ICONS)).catch(()=>{}).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key=>key.startsWith('asy-public-icons-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request).catch(()=>new Response('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b090a"><title>ASYLUM COMMUNITY — Offline</title><body style="background:#0b090a;color:#fff;font:16px system-ui;padding:2rem"><h1>ASYLUM COMMUNITY</h1><p>You are offline. Reconnect to access your dashboard and account details.</p></body></html>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}})));
    return;
  }
  // Never cache /api, authentication or any HTML/document response.
  if(!PUBLIC_ICONS.includes(url.pathname))return;
  event.respondWith(caches.open(VERSION).then(async cache=>{
    const saved=await cache.match(request);
    if(saved)return saved;
    const response=await fetch(request);
    if(response.ok && response.type==='basic')await cache.put(request,response.clone());
    return response;
  }).catch(()=>fetch(request)));
});
