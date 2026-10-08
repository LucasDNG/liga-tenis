import 'dotenv/config';
import pg from 'pg';
import {databasePoolOptions} from '../src/config.js';
import {runAuthenticatedProductionSmoke} from '../src/authenticatedProductionSmoke.js';

if(process.env.NODE_ENV!=='production')throw new Error('NODE_ENV debe ser production');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es obligatorio');
if(!process.env.JWT_SECRET)throw new Error('JWT_SECRET es obligatorio');
if(!process.env.PROD_API_URL)throw new Error('PROD_API_URL es obligatorio');
if(!process.env.PROD_FRONTEND_URL)throw new Error('PROD_FRONTEND_URL es obligatorio');

const {Pool}=pg;
const pool=new Pool(databasePoolOptions(process.env));
try{
  const result=await runAuthenticatedProductionSmoke({
    pool,
    apiUrl:process.env.PROD_API_URL,
    frontendUrl:process.env.PROD_FRONTEND_URL,
  });
  console.log(JSON.stringify(result,null,2));
}finally{
  await pool.end();
}
