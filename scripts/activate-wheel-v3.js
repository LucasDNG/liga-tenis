import 'dotenv/config';
import pg from 'pg';
import {databasePoolOptions,productionConfigReport} from '../src/config.js';
import {activateWheelV3} from '../src/wheelV3Cutover.js';

if(process.env.NODE_ENV!=='production')throw new Error('NODE_ENV debe ser production para activar Wheel v3');
const config=productionConfigReport(process.env,{strictIntegrations:false});
if(config.errors.length)throw new Error('Configuración productiva inválida: '+config.errors.join('; '));
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es obligatorio');
if(process.env.CONFIRM_WHEEL_V3_CUTOVER!=='YES')throw new Error('Falta CONFIRM_WHEEL_V3_CUTOVER=YES');
const expectedBackendSha=process.env.EXPECTED_BACKEND_SHA||process.env.EXPECTED_RELEASE_SHA;
const expectedFrontendSha=process.env.EXPECTED_FRONTEND_SHA||process.env.EXPECTED_RELEASE_SHA;
if(!/^[0-9a-f]{40}$/i.test(expectedBackendSha||''))throw new Error('EXPECTED_BACKEND_SHA debe ser un SHA Git completo de 40 caracteres');
if(!/^[0-9a-f]{40}$/i.test(expectedFrontendSha||''))throw new Error('EXPECTED_FRONTEND_SHA debe ser un SHA Git completo de 40 caracteres');
let adminUserId=Number(process.env.CUTOVER_ADMIN_USER_ID);

const {Client}=pg;
const client=new Client(databasePoolOptions(process.env));
await client.connect();

try{
  if(!Number.isInteger(adminUserId)||adminUserId<=0){
    const admins=(await client.query(
      "SELECT id FROM users WHERE role='admin' AND verification_status='verified' ORDER BY id"
    )).rows;
    if(admins.length!==1)throw new Error('CUTOVER_ADMIN_USER_ID es obligatorio salvo que exista exactamente un Admin verificado');
    adminUserId=Number(admins[0].id);
  }

  await client.query('BEGIN');
  const result=await activateWheelV3(client,{adminUserId,backendReleaseSha:expectedBackendSha,frontendReleaseSha:expectedFrontendSha});
  await client.query('COMMIT');
  console.log(JSON.stringify(result,null,2));
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  await client.end();
}
