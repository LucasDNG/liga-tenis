function normalizeHttps(value,label){
  const raw=String(value||'').trim();
  if(!raw)throw new Error(label+' es obligatorio');
  let url=null;
  try{url=new URL(raw);}catch{}
  if(!url||url.protocol!=='https:')throw new Error(label+' debe usar HTTPS');
  if(url.username||url.password||url.search||url.hash)throw new Error(label+' debe ser un origen HTTPS sin credenciales/query/fragmento');
  if(url.pathname&&url.pathname!=='/')throw new Error(label+' debe ser un origen HTTPS sin path');
  return url.origin;
}

function requireSecurityHeaders(response,label,{hsts=true}={}){
  const required={
    'x-content-type-options':'nosniff',
    'x-frame-options':'DENY',
    'referrer-policy':'strict-origin-when-cross-origin',
  };
  for(const [name,expected] of Object.entries(required)){
    if(response.headers.get(name)!==expected)throw new Error(label+' no envía '+name+' esperado');
  }
  const csp=response.headers.get('content-security-policy')||'';
  if(!/(?:^|;)\s*frame-ancestors\s+'none'\s*(?:;|$)/i.test(csp))throw new Error(label+' no bloquea framing por CSP');
  if(hsts&&!/^max-age=\d+/i.test(response.headers.get('strict-transport-security')||''))throw new Error(label+' no envía HSTS');
  if(response.headers.get('x-powered-by'))throw new Error(label+' expone X-Powered-By');
}

async function jsonGet(fetchImpl,url,frontendOrigin){
  const response=await fetchImpl(url,{headers:{Origin:frontendOrigin}});
  if(!response.ok)throw new Error(url+' respondió HTTP '+response.status);
  return {response,data:await response.json()};
}

export async function runProductionSmoke({apiUrl,frontendUrl,expectedEngine=null,expectedBackendSha=null,expectedFrontendSha=null,fetchImpl=globalThis.fetch}){
  const api=normalizeHttps(apiUrl,'PROD_API_URL');
  const frontend=normalizeHttps(frontendUrl,'PROD_FRONTEND_URL');

  const liveResult=await jsonGet(fetchImpl,api+'/api/live',frontend);
  if(liveResult.data?.ok!==true||liveResult.data?.process!=='ok')throw new Error('Liveness productiva inválida');
  requireSecurityHeaders(liveResult.response,'API liveness');
  const requestId=liveResult.response.headers.get('x-request-id')||'';
  if(!/^[A-Za-z0-9-]{8,80}$/.test(requestId))throw new Error('API productiva no envía X-Request-ID válido');

  const healthResult=await jsonGet(fetchImpl,api+'/api/health',frontend);
  const health=healthResult.data;
  if(health?.ok!==true||!['wheel-v2','wheel-v3'].includes(health?.engine)||health?.database!=='ok')throw new Error('Health productivo inválido');
  if(expectedEngine&&health.engine!==expectedEngine)throw new Error('Engine productivo inesperado: '+health.engine);
  if(expectedBackendSha&&health.release!==expectedBackendSha)throw new Error('Backend desplegado en commit inesperado: '+(health.release||'sin-version'));
  const allowOrigin=healthResult.response.headers.get('access-control-allow-origin');
  if(allowOrigin!==frontend)throw new Error('CORS productivo no autoriza el frontend esperado');
  requireSecurityHeaders(healthResult.response,'API productiva');

  const publicChecks=[
    ['/api/legal/versions',null],
    ['/api/ranking','array'],
    ['/api/venues','array'],
    ['/api/results/recent','array'],
    ['/api/upcoming','array'],
    ['/api/records','array'],
  ];
  for(const [path,kind] of publicChecks){
    const {data}=await jsonGet(fetchImpl,api+path,frontend);
    if(kind==='array'&&!Array.isArray(data))throw new Error(path+' no devolvió una lista');
  }

  const privateProbe=await fetchImpl(api+'/api/auth/__smoke_no_store__',{headers:{Origin:frontend}});
  if(privateProbe.status!==404)throw new Error('Probe no-store respondió HTTP '+privateProbe.status+'; se esperaba 404');
  if(privateProbe.headers.get('cache-control')!=='no-store')throw new Error('Auth productivo no envía Cache-Control: no-store');
  if(privateProbe.headers.get('pragma')!=='no-cache')throw new Error('Auth productivo no envía Pragma: no-cache');

  const frontResponse=await fetchImpl(frontend);
  if(!frontResponse.ok)throw new Error('Frontend respondió HTTP '+frontResponse.status);
  requireSecurityHeaders(frontResponse,'Frontend productivo');
  const html=await frontResponse.text();
  if(!/id=["']root["']/.test(html))throw new Error('Frontend no parece contener el root de la SPA');
  const releaseMatch=html.match(/<meta\s+name=["']la-red-release["']\s+content=["']([^"']+)["']\s*\/?>/i);
  const frontendRelease=releaseMatch?.[1]||null;
  if(expectedFrontendSha&&frontendRelease!==expectedFrontendSha)throw new Error('Frontend desplegado en commit inesperado: '+(frontendRelease||'sin-version'));

  return {
    ok:true,
    api,
    frontend,
    engine:health.engine,
    process:liveResult.data.process,
    database:health.database,
    requestId:true,
    cors:true,
    securityHeaders:true,
    privateNoStore:true,
    publicEndpoints:publicChecks.length,
    backendRelease:health.release||null,
    frontendRelease,
  };
}
