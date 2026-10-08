import 'dotenv/config';
import pg from 'pg';
import {databasePoolOptions} from '../src/config.js';
import {applyProductionMigrations} from '../src/migrations.js';

if(process.env.NODE_ENV!=='production')throw new Error('migrate:prod requiere NODE_ENV=production');
if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es obligatorio');

const {Client}=pg;
const client=new Client(databasePoolOptions(process.env));
await client.connect();
try{
  const result=await applyProductionMigrations(client);
  console.log(JSON.stringify(result));
}finally{
  await client.end();
}
