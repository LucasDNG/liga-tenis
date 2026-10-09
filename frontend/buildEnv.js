export function productionApiUrl(raw){
  const value=String(raw||'').trim();
  if(!value)throw new Error('VITE_API_URL es obligatorio en build de producción');
  let url=null;
  try{url=new URL(value);}catch{}
  if(!url||url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('VITE_API_URL debe ser HTTPS y no incluir credenciales/query/fragmento');
  const pathname=url.pathname.replace(/\/+$/,'');
  if(pathname!=='/api')throw new Error('VITE_API_URL debe terminar exactamente en /api');
  return url.origin+'/api';
}
