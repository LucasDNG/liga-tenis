const INSECURE_SSL_MODES=new Set(['disable','allow','prefer','no-verify']);

function clean(value){return String(value??'').trim();}
export function whatsappConfiguration(env=process.env){
  const required=['WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ACCESS_TOKEN','WHATSAPP_TEMPLATE_NAME','WHATSAPP_GRAPH_VERSION','WHATSAPP_TEMPLATE_LANGUAGE'];
  const missing=required.filter(key=>!clean(env[key]));
  const invalid=[];
  for(const [key,pattern] of [
    ['WHATSAPP_PHONE_NUMBER_ID',/^\d+$/],
    ['WHATSAPP_TEMPLATE_NAME',/^[a-z0-9_]+$/],
    ['WHATSAPP_GRAPH_VERSION',/^v\d+\.\d+$/],
    ['WHATSAPP_TEMPLATE_LANGUAGE',/^[a-z]{2}_[A-Z]{2}$/],
  ])if(clean(env[key])&&!pattern.test(clean(env[key])))invalid.push(key);
  return {configured:missing.length===0&&invalid.length===0,missing,invalid};
}
function parseDatabaseUrl(raw){
  const value=clean(raw);
  if(!value)return null;
  try{return new URL(value);}catch{return null;}
}
function base32Secret(value){return /^[A-Z2-7]+=*$/i.test(clean(value))&&clean(value).replace(/=+$/,'').length>=32;}
export function frontendOrigins(env=process.env){return clean(env.FRONTEND_URL).split(',').map(x=>x.trim()).filter(Boolean).map(x=>{try{return new URL(x).origin;}catch{return x;}});}
export function corsOrigins(env=process.env){
  return [...new Set(frontendOrigins(env))];
}

export function databasePoolOptions(env=process.env){
  const connectionString=clean(env.DATABASE_URL);
  const options={
    connectionString:connectionString||undefined,
    application_name:'la-red-tenis',
    connectionTimeoutMillis:10000,
    idleTimeoutMillis:30000,
  };
  if(env.NODE_ENV==='production'){
    if(!connectionString)throw new Error('DATABASE_URL es obligatorio en producción');
    const url=parseDatabaseUrl(connectionString);
    if(!url)throw new Error('DATABASE_URL inválida');
    const sslMode=clean(url.searchParams.get('sslmode')).toLowerCase();
    if(INSECURE_SSL_MODES.has(sslMode))throw new Error('DATABASE_URL usa un modo SSL inseguro');
    const hasSslOptions=['sslmode','sslcert','sslkey','sslrootcert','ssl'].some(k=>url.searchParams.has(k));
    if(!hasSslOptions)options.ssl=true;
  }
  return options;
}

export function productionConfigReport(env=process.env,{strictIntegrations=false}={}){
  const errors=[],warnings=[];
  if(env.NODE_ENV!=='production')errors.push('NODE_ENV debe ser production');

  const db=clean(env.DATABASE_URL),dbUrl=parseDatabaseUrl(db);
  if(!db)errors.push('DATABASE_URL es obligatorio');
  else if(!dbUrl)errors.push('DATABASE_URL no es una URL PostgreSQL válida');
  else{
    const mode=clean(dbUrl.searchParams.get('sslmode')).toLowerCase();
    if(INSECURE_SSL_MODES.has(mode))errors.push('DATABASE_URL no puede usar sslmode inseguro');
    if(/\.neon\.tech$/i.test(dbUrl.hostname)){
      const channel=clean(dbUrl.searchParams.get('channel_binding')).toLowerCase();
      if(mode==='require'&&channel!=='require')warnings.push('Neon: preferí channel_binding=require o verificación completa del certificado');
    }
  }

  const jwt=clean(env.JWT_SECRET);
  if(jwt.length<32||/cambiar|change|secret/i.test(jwt))errors.push('JWT_SECRET debe ser aleatorio y tener al menos 32 caracteres');

  const rawOrigins=clean(env.FRONTEND_URL).split(',').map(x=>x.trim()).filter(Boolean);
  if(!rawOrigins.length)errors.push('FRONTEND_URL es obligatorio');
  else{
    for(const raw of rawOrigins){
      let url=null;try{url=new URL(raw);}catch{}
      if(!url||url.protocol!=='https:'||/localhost|127\.0\.0\.1/i.test(url.hostname)||url.username||url.password||url.search||url.hash||(url.pathname&&url.pathname!=='/'))errors.push('FRONTEND_URL de producción debe contener solo orígenes HTTPS sin path/query/credenciales');
    }
  }

  if(!base32Secret(env.ADMIN_TOTP_SECRET))errors.push('ADMIN_TOTP_SECRET debe ser Base32 y aportar al menos 160 bits (32 caracteres sin padding)');
  if(jwt&&clean(env.ADMIN_TOTP_SECRET)&&jwt===clean(env.ADMIN_TOTP_SECRET))errors.push('JWT_SECRET y ADMIN_TOTP_SECRET deben ser secretos distintos');

  const {missing:missingWhatsApp,invalid:invalidWhatsApp}=whatsappConfiguration(env);
  if(missingWhatsApp.length){
    const msg='WhatsApp incompleto: '+missingWhatsApp.join(', ');
    if(strictIntegrations)errors.push(msg);else warnings.push(msg);
  }
  for(const key of invalidWhatsApp)errors.push(key+' inválido');

  return {errors,warnings};
}

export function assertRuntimeConfig(env=process.env){
  if(env.NODE_ENV!=='production')return {errors:[],warnings:[]};
  const report=productionConfigReport(env,{strictIntegrations:false});
  if(report.errors.length)throw new Error('Configuración de producción inválida: '+report.errors.join('; '));
  return report;
}
