import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import pg from 'pg';

const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw new Error('TEST_DATABASE_URL es obligatorio: verify:db es destructivo y nunca usa DATABASE_URL de producción');

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const schema=fs.readFileSync(path.resolve(__dirname,'../database/schema.sql'),'utf8');
const verify=fs.readFileSync(path.resolve(__dirname,'../database/verify.sql'),'utf8');
const statements=verify
  .split(';')
  .map(s=>s.trim())
  .filter(Boolean);

const client=new pg.Client({connectionString});
await client.connect();
try{
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  await client.query(schema);

  const informational=[];
  for(let i=0;i<statements.length;i++){
    const result=await client.query(statements[i]);
    if(i<3)informational.push(result.rows[0]||null);
    else if(result.rowCount>0){
      throw new Error('database/verify.sql detectó una inconsistencia en control #'+(i-2)+': '+JSON.stringify(result.rows.slice(0,10)));
    }
  }

  const counts=Object.fromEntries(informational.filter(Boolean).map(r=>[r.table_name,Number(r.count)]));
  if(counts.users!==0)throw new Error('Una instalación limpia debe iniciar sin usuarios');
  if(counts.leagues!==2)throw new Error('Una instalación limpia debe crear exactamente 2 circuitos');
  if(counts.categories!==14)throw new Error('Una instalación limpia debe crear exactamente 14 categorías');

  console.log('database/schema.sql + database/verify.sql: OK',counts);
}finally{
  await client.end();
}
