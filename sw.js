const CACHE='moveup-v15';
const CORE=['./','./index.html','./manifest.webmanifest'];

self.addEventListener('install',e=>e.waitUntil(
  caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())
));

self.addEventListener('activate',e=>e.waitUntil(
  caches.keys()
    .then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
    .then(()=>self.clients.claim())
));

async function getResponse(request){
  const cached=await caches.match(request);
  try{
    const response=await fetch(request);
    const copy=response.clone();
    caches.open(CACHE).then(c=>c.put(request,copy));
    return response;
  }catch(_){
    return cached||caches.match('./index.html');
  }
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith(getResponse(e.request));
});