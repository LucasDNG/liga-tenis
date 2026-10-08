import 'dotenv/config';
import {pool} from '../src/db.js';

const dni=String(process.argv[2]||'').replace(/\D/g,'');
if(!dni){
  console.error('Uso: npm run admin:promote -- <DNI>');
  process.exit(1);
}

const client=await pool.connect();
try{
  await client.query('BEGIN');

  const before=(await client.query(
    `SELECT id,first_name,last_name,dni,role,verification_status
     FROM users WHERE dni=$1 FOR UPDATE`,
    [dni]
  )).rows[0];

  if(!before){
    throw new Error('No existe una cuenta con ese DNI. Registrala primero desde LA RED.');
  }

  const user=(await client.query(
    `UPDATE users
     SET role='admin',
         verification_status='verified',
         verified_at=COALESCE(verified_at,now()),
         updated_at=now()
     WHERE id=$1
     RETURNING id,first_name,last_name,dni,role,verification_status`,
    [before.id]
  )).rows[0];

  // Si la cuenta estaba pendiente, el bootstrap de propietario cierra esa
  // verificación y no deja las imágenes identificatorias activas.
  await client.query(`DELETE FROM identity_documents WHERE user_id=$1`,[user.id]);

  await client.query(
    `INSERT INTO security_events(user_id,event_type,data)
     VALUES($1,'admin_bootstrap',$2::jsonb)`,
    [user.id,JSON.stringify({
      previousRole:before.role,
      previousVerificationStatus:before.verification_status
    })]
  );

  await client.query('COMMIT');

  console.log(`ADMIN LISTO: ${user.first_name} ${user.last_name} · DNI ${user.dni}`);
  console.log('Cerrá sesión en LA RED y volvé a ingresar para refrescar el rol.');
}catch(error){
  await client.query('ROLLBACK');
  console.error(error.message||error);
  process.exitCode=1;
}finally{
  client.release();
  await pool.end();
}
