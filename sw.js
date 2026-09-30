const CACHE='moveup-v13';
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

async function transformHomeIfNeeded(request,response){
  if(!response) return response;
  const url=new URL(request.url);
  const isHome=request.mode==='navigate' || url.pathname.endsWith('/moveup/') || url.pathname.endsWith('/index.html');
  const contentType=response.headers.get('content-type')||'';
  if(!isHome || !contentType.includes('text/html')) return response;

  const html=await response.clone().text();
  const transformed=html.replace(
    '@media(max-width:640px) and (max-height:720px)',
    '@media(max-width:640px) and (max-height:520px)'
  );

  const headers=new Headers(response.headers);
  headers.delete('content-length');
  return new Response(transformed,{
    status:response.status,
    statusText:response.statusText,
    headers
  });
}

self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  e.respondWith((async()=>{
    const response=await getResponse(e.request);
    return transformHomeIfNeeded(e.request,response);
  })());
});