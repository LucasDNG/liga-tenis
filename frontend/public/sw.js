const CACHE='la-red-v7';
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll([
    '/',
    '/manifest.webmanifest',
    '/favicon.png',
    '/icon-192.png',
    '/icon-512.png'
  ]);
  await self.skipWaiting();
})()));

self.addEventListener('activate',e=>e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(
    e.request.method!=='GET' ||
    url.origin!==self.location.origin ||
    url.pathname.startsWith('/api/')
  ) return;

  e.respondWith((async()=>{
    try{
      return await fetch(e.request);
    }catch{
      const exact=await caches.match(e.request);
      if(exact)return exact;

      if(e.request.mode==='navigate'){
        const shell=await caches.match('/');
        if(shell)return shell;
      }

      return Response.error();
    }
  })());
});
