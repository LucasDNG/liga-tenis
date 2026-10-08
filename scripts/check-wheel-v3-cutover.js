import 'dotenv/config';
import pg from 'pg';
import {databasePoolOptions} from '../src/config.js';
import {wheelV3CutoverReadiness} from '../src/wheelV3Cutover.js';

if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL es obligatorio');

const {Client}=pg;
const client=new Client(databasePoolOptions(process.env));
await client.connect();
try{
  const state=await wheelV3CutoverReadiness(client);
  console.log(JSON.stringify(state,null,2));
  if(!state.ready)process.exitCode=2;
}finally{
  await client.end();
}
