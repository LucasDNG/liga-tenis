import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
export const PRODUCTION_MIGRATIONS=[
  path.resolve(__dirname,'../database/PATCH_MATCH_ABANDONMENT_2026-09-21.sql'),
  path.resolve(__dirname,'../database/PATCH_FREE_TEXT_LOCATIONS_2026-09-22.sql'),
  path.resolve(__dirname,'../database/PATCH_WHEEL_V3_STATE_2026-09-28.sql'),
  path.resolve(__dirname,'../database/PATCH_WHATSAPP_OUTBOX_EXPIRY_2026-09-29.sql')
];

export async function applyProductionMigrations(client){
  await client.query('SELECT pg_advisory_lock(7331,20260921)');
  try{
    for(const file of PRODUCTION_MIGRATIONS){
      const sql=fs.readFileSync(file,'utf8');
      await client.query(sql);
    }
    const column=(await client.query(`
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='matches'
        AND column_name='abandoned_pair_id'
    `)).rowCount;
    if(!column)throw new Error('Migración incompleta: falta matches.abandoned_pair_id');

    const constraint=(await client.query(`
      SELECT 1
      FROM pg_constraint
      WHERE conname='matches_abandonment_consistency'
        AND conrelid='matches'::regclass
    `)).rowCount;
    if(!constraint)throw new Error('Migración incompleta: falta matches_abandonment_consistency');

    const wheelV3State=(await client.query(`
      SELECT
        to_regclass('public.league_wheel_state') IS NOT NULL
        AND to_regclass('public.pair_wheel_state') IS NOT NULL
        AND to_regclass('public.pair_duo_state') IS NOT NULL
        AND to_regclass('public.first_place_reigns') IS NOT NULL AS ok
    `)).rows[0]?.ok;
    if(!wheelV3State)throw new Error('Migración incompleta: falta estado preparatorio Wheel v3');

    const wheelV3Columns=(await client.query(`
      SELECT count(*)::int n
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name='wheel_assignments'
        AND column_name IN('attacker_pair_id','defender_pair_id','cancelled_at','first_result_at','first_place_reign_id')
    `)).rows[0]?.n;
    if(wheelV3Columns!==5)throw new Error('Migración incompleta: faltan columnas Wheel v3 en wheel_assignments');

    const outboxStatusConstraint=(await client.query(`
      SELECT pg_get_constraintdef(oid) definition
      FROM pg_constraint
      WHERE conname='notification_outbox_status_check'
        AND conrelid='notification_outbox'::regclass
    `)).rows[0]?.definition||'';
    if(!outboxStatusConstraint.includes('expired')){
      throw new Error('Migración incompleta: notification_outbox no admite estado expired');
    }

    return {ok:true,applied:PRODUCTION_MIGRATIONS.map(file=>path.basename(file))};
  }finally{
    await client.query('SELECT pg_advisory_unlock(7331,20260921)');
  }
}
