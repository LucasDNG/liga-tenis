import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const appSource=await readFile(new URL('../src/app.js',import.meta.url),'utf8');
const frontSource=await readFile(new URL('../frontend/src/App.jsx',import.meta.url),'utf8');

function norm(path){
  return path.replace(/^\/api/,'').replace(/\$\{[^}]+\}/g,':x').replace(/:[A-Za-z0-9_]+/g,':x');
}

test('cada endpoint funcional normal tiene un flujo visible en el frontend',()=>{
  const backend=[...appSource.matchAll(/\bapp\.(get|post|patch|put|delete)\(\s*['"`]([^'"`]+)['"`]/g)]
    .map(m=>({method:m[1].toUpperCase(),path:m[2]}))
    .filter(x=>!['/api/live','/api/health'].includes(x.path));
  const calls=[...frontSource.matchAll(/\bapi\.(get|post|patch|put|delete)\(\s*([\`'"])(.*?)\2/g)]
    .map(m=>({method:m[1].toUpperCase(),path:m[3]}));
  const missing=backend.filter(b=>!calls.some(c=>c.method===b.method&&norm(c.path)===norm(b.path)));
  assert.deepEqual(missing,[]);
});

test('journey visible cubre lugar libre, confirmaciones y acciones temporales',()=>{
  assert.match(frontSource,/Lugar \/ cancha/);
  assert.match(frontSource,/Su mención no implica vínculo comercial con LA RED/);
  assert.match(frontSource,/CONFIRMAR PAUSA/);
  assert.match(frontSource,/CONFIRMAR DISOLUCIÓN/);
  assert.match(frontSource,/extensionOpen/);
  assert.match(frontSource,/canNoShow/);
  assert.match(frontSource,/Las dos versiones no coinciden/);
  assert.match(frontSource,/GUARDAR CORRECCIÓN/);
  assert.match(frontSource,/VENTANA DE 15 DÍAS/);
  assert.match(frontSource,/ENVIAR REPORTE DEL PARTIDO RECIENTE/);
  assert.match(frontSource,/Canchas adheridas a LA RED/);
  assert.match(frontSource,/Sede adherida \/ visible públicamente/);
  assert.match(frontSource,/GUARDAR CAMBIOS/);
  assert.match(frontSource,/Quitar foto del frente del DNI/);
  assert.match(frontSource,/Quitar foto del dorso del DNI/);
  assert.match(frontSource,/Elegir archivo/);
  assert.match(frontSource,/Sin archivo/);
  assert.match(frontSource,/dniFront:null/);
  assert.match(frontSource,/dniBack:null/);
});


test('Wheel v3 frontend oculta ranking numerico paralelo y expone acciones nuevas',()=>{
  assert.doesNotMatch(frontSource,/\bELO\b/i);
  assert.doesNotMatch(frontSource,/\.elo\b/);
  assert.match(frontSource,/d\.engine==='wheel-v3'/);
  assert.match(frontSource,/NO PUDE JUGAR/);
  assert.match(frontSource,/\/cannot-play/);
  assert.match(frontSource,/\/no-show\/cancel/);
  assert.match(frontSource,/\/no-show\/accept/);
  assert.match(frontSource,/RECONOCER NO-SHOW/);
  assert.match(frontSource,/CANCELAR NO-SHOW/);
  assert.match(frontSource,/PASAR A INACTIVA/);
  assert.match(frontSource,/CANCELAR PROPUESTA/);
  assert.match(frontSource,/status\?\.engine==='wheel-v3'/);
  assert.match(frontSource,/no_show_dismiss/);
  assert.match(frontSource,/no_show_fail/);
});

test('extension extraordinaria queda condicionada fuera de Wheel v3',()=>{
  assert.match(frontSource,/!isV3&&extensionOpen/);
  assert.match(frontSource,/!isV3&&a\.extraordinary_used/);
});

test('result review shows submitted versions and keeps the response form reachable',()=>{
  assert.match(frontSource,/\[a\.myVersion,a\.otherVersion\]\.filter\(Boolean\)\.map/);
  assert.match(frontSource,/resultScoreText\(v\)/);
  assert.match(frontSource,/canEditResult\(a\)&&/);
  assert.match(frontSource,/ENVIAR MI VERSIÓN/);
  assert.doesNotMatch(frontSource,/a\.otherVersion&&!a\.myVersion\?<button/);
  assert.match(frontSource,/playedAt:argentinaInputToIso\(result\.playedAt\)/);
  assert.match(frontSource,/scheduledAt:argentinaInputToIso\(schedule\.scheduledAt\)/);
});
