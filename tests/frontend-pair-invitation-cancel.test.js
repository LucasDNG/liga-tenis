import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Mi pareja permite cancelar una invitación saliente pendiente',async()=>{
  const source=await readFile(new URL('../frontend/src/App.jsx',import.meta.url),'utf8');
  assert.match(source,/d\.outgoing\.length>0/);
  assert.match(source,/Invitación enviada/);
  assert.match(source,/pair-invitations\/\$\{i\.id\}\/cancel/);
  assert.match(source,/CANCELAR/);
});


test('Mi pareja muestra pausa o reactivación según el estado competitivo',async()=>{
  const source=await readFile(new URL('../frontend/src/App.jsx',import.meta.url),'utf8');
  assert.ok(source.includes("d.pair.competition_state==='active'"));
  assert.match(source,/PAUSAR AL TERMINAR|'PEDIR PAUSA'/);
  assert.match(source,/CONFIRMAR PAUSA/);
  assert.ok(source.includes("d.pair.competition_state==='paused'"));
  assert.match(source,/REACTIVAR/);
});
