import crypto from 'node:crypto';

const SAFE_ERROR_CODES=new Set([
  'LIMIT_FILE_SIZE','LIMIT_FILE_COUNT','23505','23503','23514','22P02','42P08'
]);

export function safeErrorLog(err,req,{production=process.env.NODE_ENV==='production'}={}){
  const status=Number(err?.statusCode)||(String(err?.code||'').startsWith('23')?400:500);
  const code=SAFE_ERROR_CODES.has(String(err?.code||''))?String(err.code):undefined;
  const entry={
    level:'error',
    method:String(req?.method||'').slice(0,12),
    path:String(req?.path||req?.originalUrl||'').split('?')[0].slice(0,200),
    status,
    ...(code?{code}:{}),
    ...(req?.requestId?{requestId:String(req.requestId).slice(0,80)}:{}),
    ...(req?.cfRay?{cfRay:String(req.cfRay).slice(0,80)}:{}),
    name:String(err?.name||'Error').slice(0,80),
  };
  if(!production)entry.message=String(err?.message||'Error interno').slice(0,500);
  return entry;
}

export function authRateLimitKey(req){
  const ip=String(req?.ip||'unknown').slice(0,120);
  const route=String(req?.path||req?.originalUrl||'auth').split('?')[0].slice(0,120);
  return ip+':'+route;
}


export function safeClientErrorMessage(err,{production=process.env.NODE_ENV==='production'}={}){
  if(err?.code==='LIMIT_FILE_SIZE')return 'Cada foto del DNI puede pesar hasta 5 MB';
  if(err?.code==='LIMIT_FILE_COUNT')return 'Solo se permiten frente y dorso del DNI';
  if(err?.code==='23505'){
    if(err?.constraint==='users_dni_key')return 'Ya existe una cuenta con ese DNI. Usá la recuperación de acceso.';
    return 'Ese dato ya existe o la operación ya fue realizada';
  }
  const status=Number(err?.statusCode)||(String(err?.code||'').startsWith('23')?400:500);
  if(production&&status>=500)return 'Error interno';
  return String(err?.message||'Error interno').slice(0,500);
}


export function safeBackgroundErrorLog(err,task,{production=process.env.NODE_ENV==='production'}={}){
  const code=SAFE_ERROR_CODES.has(String(err?.code||''))?String(err.code):undefined;
  const entry={
    level:'error',
    task:String(task||'background').slice(0,80),
    ...(code?{code}:{}),
    name:String(err?.name||'Error').slice(0,80),
  };
  if(!production)entry.message=String(err?.message||'Error interno').slice(0,500);
  return entry;
}

export function createFixedWindowRateLimitStore({windowMs=15*60*1000,maxEntries=10000}={}){
  const duration=Math.max(1,Number(windowMs)||1);
  const capacity=Math.max(1,Number(maxEntries)||1);
  const entries=new Map();

  function cleanup(now=Date.now()){
    for(const [key,value] of entries){
      if(value.reset<=now)entries.delete(key);
    }
    return entries.size;
  }

  function hit(key,now=Date.now()){
    const normalized=String(key||'unknown').slice(0,300);
    let entry=entries.get(normalized);
    if(entry&&entry.reset<=now){
      entries.delete(normalized);
      entry=null;
    }
    if(!entry){
      if(entries.size>=capacity)cleanup(now);
      if(entries.size>=capacity){
        return {count:0,reset:now+duration,saturated:true,size:entries.size};
      }
      entry={count:0,reset:now+duration};
      entries.set(normalized,entry);
    }
    entry.count+=1;
    return {count:entry.count,reset:entry.reset,saturated:false,size:entries.size};
  }

  return {
    hit,
    cleanup,
    size:()=>entries.size,
    capacity,
  };
}


export function securityResponseHeaders({production=process.env.NODE_ENV==='production'}={}){
  return {
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Content-Security-Policy':"frame-ancestors 'none'",
    ...(production?{'Strict-Transport-Security':'max-age=31536000'}:{}),
  };
}

export function privateResponseHeaders(path){
  const clean=String(path||'').split('?')[0];
  if(/^\/api\/(?:auth(?:\/|$)|me(?:\/|$)|admin(?:\/|$))/.test(clean)){
    return {'Cache-Control':'no-store','Pragma':'no-cache'};
  }
  return {};
}


export function createRequestTrace(req,{generate=()=>crypto.randomUUID()}={}){
  const requestId=String(generate()).slice(0,80);
  const rawCfRay=String(req?.headers?.['cf-ray']||'').trim();
  const cfRay=/^[A-Za-z0-9-]{1,80}$/.test(rawCfRay)?rawCfRay:undefined;
  return {requestId,...(cfRay?{cfRay}:{})};
}
