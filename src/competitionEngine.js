import {q} from './db.js';
import {scoreGames,individualCategoryAfterMove,eloForPosition,simultaneousPenaltyOrder,relegationLossThreshold} from './core.js';

export async function event(client,sourceKey,eventType,{pairId=null,userId=null,assignmentId=null,data={}}={}){
  return (await q(client,`INSERT INTO competitive_events(source_key,event_type,pair_id,user_id,assignment_id,data) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(source_key) DO NOTHING RETURNING *`,[sourceKey,eventType,pairId,userId,assignmentId,JSON.stringify(data)])).rows[0]||null;
}
export async function pairName(client,pairId){return (await q(client,`SELECT string_agg(u.first_name||' '||u.last_name,' / ' ORDER BY u.id) name FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=$1`,[pairId])).rows[0].name;}
async function lockSportingScope(client,categoryId){
  const current=(await q(client,`SELECT league_id,number FROM categories WHERE id=$1`,[categoryId])).rows[0];
  if(!current)throw new Error('Categoría inexistente');
  const low=Math.max(1,Number(current.number)-1),high=Math.min(7,Number(current.number)+1);
  await q(client,`SELECT id FROM categories WHERE league_id=$1 AND number BETWEEN $2 AND $3 ORDER BY number FOR UPDATE`,[current.league_id,low,high]);
}
export async function renumberCategory(client,categoryId){
  const rows=(await q(client,`SELECT id,competition_state FROM pairs WHERE category_id=$1 AND competition_state<>'inactive' ORDER BY CASE WHEN competition_state='active' THEN 0 ELSE 1 END,position,id FOR UPDATE`,[categoryId])).rows;
  if(!rows.length)return;
  const base=100000+rows.length;
  for(let i=0;i<rows.length;i++)await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[rows[i].id,base+i]);
  for(let i=0;i<rows.length;i++)await q(client,`UPDATE pairs SET position=$2,updated_at=now() WHERE id=$1`,[rows[i].id,i+1]);
}
export async function recalcCategoryElos(client,categoryId){
  const pairs=(await q(client,`SELECT p.id,p.position,p.competition_state,p.first_place_defenses,c.number category_number,l.slug,(SELECT count(*) FROM matches m WHERE m.pair_a_id=p.id OR m.pair_b_id=p.id) played FROM pairs p JOIN categories c ON c.id=p.category_id JOIN leagues l ON l.id=p.league_id WHERE p.category_id=$1 AND p.competition_state<>'inactive' ORDER BY p.position`,[categoryId])).rows;
  const active=pairs.filter(p=>p.competition_state==='active'); const n=active.length;
  for(const p of pairs){
    const idx=active.findIndex(x=>x.id===p.id); const pos=idx+1;
    const elo=eloForPosition({activeCount:n,activePosition:pos,played:p.played,categoryNumber:p.category_number,defenses:p.first_place_defenses,state:p.competition_state});
    await q(client,`UPDATE pairs SET elo=$2,peak_elo=GREATEST(peak_elo,$2),peak_elo_at=CASE WHEN $2>peak_elo THEN now() ELSE peak_elo_at END WHERE id=$1`,[p.id,elo]);
  }
}
async function insertAtActivePosition(client,pairId,targetCategoryId,desired){
  const active=(await q(client,`SELECT id FROM pairs WHERE category_id=$1 AND competition_state='active' AND id<>$2 ORDER BY position,id FOR UPDATE`,[targetCategoryId,pairId])).rows.map(r=>r.id);
  const paused=(await q(client,`SELECT id FROM pairs WHERE category_id=$1 AND competition_state='paused' AND id<>$2 ORDER BY position,id FOR UPDATE`,[targetCategoryId,pairId])).rows.map(r=>r.id);
  const pos=Math.max(1,Math.min(Number(desired),active.length+1)); active.splice(pos-1,0,pairId); const all=[...active,...paused];
  const base=200000+all.length;
  for(let i=0;i<all.length;i++)await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[all[i],base+i]);
  for(let i=0;i<all.length;i++)await q(client,`UPDATE pairs SET position=$2,category_id=$3,updated_at=now() WHERE id=$1`,[all[i],i+1,targetCategoryId]);
  return pos;
}
async function moveCategory(client,pair,dir,sourceKey){
  const from=(await q(client,`SELECT c.number,p.league_id,p.category_id,p.position_debt FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1 FOR UPDATE OF p`,[pair.id])).rows[0];
  const targetNumber=Number(from.number)+dir; if(targetNumber<1||targetNumber>7)return null;
  const target=(await q(client,`SELECT id FROM categories WHERE league_id=$1 AND number=$2`,[from.league_id,targetNumber])).rows[0];
  const activeCount=Number((await q(client,`SELECT count(*) n FROM pairs WHERE category_id=$1 AND competition_state='active' AND id<>$2`,[target.id,pair.id])).rows[0].n);
  let desired,remainingDebt=0;
  if(dir<0){desired=activeCount+1;}else{
    const raw=activeCount===0?1:2+Number(from.position_debt||0); desired=Math.min(raw,activeCount+1); remainingDebt=Math.max(0,raw-(activeCount+1));
  }
  const oldCategory=from.category_id;
  await q(client,`UPDATE pairs SET category_id=$2,position=999999,position_debt=$3,consecutive_wins=0,consecutive_losses=0,first_place_defenses=0 WHERE id=$1`,[pair.id,target.id,dir>0?remainingDebt:from.position_debt]);
  await renumberCategory(client,oldCategory); await insertAtActivePosition(client,pair.id,target.id,desired);
  const members=(await q(client,`SELECT u.id,u.current_category_number FROM pair_members pm JOIN users u ON u.id=pm.user_id WHERE pm.pair_id=$1 FOR UPDATE OF u`,[pair.id])).rows;
  for(const m of members){const next=individualCategoryAfterMove(m.current_category_number,Number(from.number),targetNumber);await q(client,`UPDATE users SET current_category_number=$2,updated_at=now() WHERE id=$1`,[m.id,next]);}
  await event(client,`${sourceKey}:${dir<0?'promotion':'relegation'}`,dir<0?'promotion':'relegation',{pairId:pair.id,data:{from:Number(from.number),to:targetNumber,entryPosition:desired,remainingDebt}});
  await recalcCategoryElos(client,oldCategory); await recalcCategoryElos(client,target.id);
  return {from:Number(from.number),to:targetNumber};
}
export async function applyPositionPenalties(client,pairIds,{sourceKey='penalty'}={}){
  const ids=[...new Set(pairIds.map(Number))]; if(!ids.length)return;
  for(const id of ids){if((await q(client,`SELECT 1 FROM competitive_events WHERE source_key=$1`,[`${sourceKey}:pair:${id}`])).rowCount)return;}
  const rows=(await q(client,`SELECT id,category_id,position FROM pairs WHERE id=ANY($1::bigint[]) FOR UPDATE`,[ids])).rows;
  const byCat=new Map(); for(const r of rows){if(!byCat.has(r.category_id))byCat.set(r.category_id,[]);byCat.get(r.category_id).push(Number(r.id));}
  for(const [cat,penIds] of byCat){
    const order=(await q(client,`SELECT id FROM pairs WHERE category_id=$1 AND competition_state='active' ORDER BY position,id FOR UPDATE`,[cat])).rows.map(r=>Number(r.id));
    const oldLeader=order[0]||null; const categoryNumber=Number((await q(client,`SELECT number FROM categories WHERE id=$1`,[cat])).rows[0]?.number||0);
    const currentDebt=Object.fromEntries((await q(client,`SELECT id,position_debt FROM pairs WHERE id=ANY($1::bigint[])`,[order])).rows.map(r=>[Number(r.id),Number(r.position_debt)]));
    const applied=simultaneousPenaltyOrder(order,penIds,currentDebt);order.splice(0,order.length,...applied.order);
    for(const id of order)if(Number(applied.debt[id]||0)!==Number(currentDebt[id]||0))await q(client,`UPDATE pairs SET position_debt=$2 WHERE id=$1`,[id,applied.debt[id]]);
    if(categoryNumber===1&&oldLeader&&order[0]!==oldLeader)await q(client,`UPDATE pairs SET first_place_defenses=0 WHERE id=$1`,[oldLeader]);
    const paused=(await q(client,`SELECT id FROM pairs WHERE category_id=$1 AND competition_state='paused' ORDER BY position,id FOR UPDATE`,[cat])).rows.map(r=>Number(r.id)); const all=[...order,...paused];
    const base=300000+all.length;for(let k=0;k<all.length;k++)await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[all[k],base+k]);for(let k=0;k<all.length;k++)await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[all[k],k+1]);
    await recalcCategoryElos(client,cat);
  }
  for(const id of ids)await event(client,`${sourceKey}:pair:${id}`,'position_penalty',{pairId:id,data:{reason:sourceKey}});
}
export async function applySportingResult(client,{assignment,winnerPairId,resultType,score,abandonedPairId=null,playedAt,source}){
  const key=`match:${assignment.id}`;
  await q(client,`SELECT id FROM wheel_assignments WHERE id=$1 FOR UPDATE`,[assignment.id]);
  const exists=(await q(client,`SELECT id FROM matches WHERE assignment_id=$1`,[assignment.id])).rows[0]; if(exists)return exists;
  await lockSportingScope(client,assignment.category_id);
  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)]; const loserPairId=pairIds.find(x=>x!==Number(winnerPairId));
  const locked=(await q(client,`SELECT id,category_id,position,consecutive_wins,consecutive_losses,first_place_defenses FROM pairs WHERE id=ANY($1::bigint[]) FOR UPDATE`,[pairIds])).rows; const before=Object.fromEntries(locked.map(r=>[r.id,{...r}]));
  const games=resultType==='normal'?scoreGames(score):{a:0,b:0};
  const match=(await q(client,`INSERT INTO matches(assignment_id,league_id,category_number,pair_a_id,pair_b_id,winner_pair_id,result_type,score,abandoned_pair_id,pair_a_games,pair_b_games,played_at,resolution_source) SELECT $1,wa.league_id,c.number,wa.pair_a_id,wa.pair_b_id,$2,$3,$4::jsonb,$5,$6,$7,$8,$9 FROM wheel_assignments wa JOIN categories c ON c.id=wa.category_id WHERE wa.id=$1 RETURNING *`,[assignment.id,winnerPairId,resultType,JSON.stringify(score??null),abandonedPairId??null,games.a,games.b,playedAt,source])).rows[0];
  const w=before[winnerPairId],l=before[loserPairId];
  const winnerWasFirst=Number(w.position)===1;
  if(Number(w.position)>Number(l.position)){
    const categoryNumber=Number((await q(client,`SELECT number FROM categories WHERE id=$1`,[assignment.category_id])).rows[0]?.number||0);
    await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[w.id,1000000]);await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[l.id,w.position]);await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[w.id,l.position]);
    if(categoryNumber===1&&Number(l.position)===1){await q(client,`UPDATE pairs SET first_place_defenses=0 WHERE id=$1`,[l.id]);await q(client,`UPDATE pairs SET first_place_defenses=0 WHERE id=$1`,[w.id]);}
    await event(client,`${key}:swap`,'ladder_swap',{pairId:w.id,assignmentId:assignment.id,data:{from:Number(w.position),to:Number(l.position)}});
  }
  await q(client,`UPDATE pairs SET consecutive_wins=consecutive_wins+1,consecutive_losses=0,monthly_miss_streak=0 WHERE id=$1`,[winnerPairId]);
  await q(client,`UPDATE pairs SET consecutive_losses=consecutive_losses+1,consecutive_wins=0,monthly_miss_streak=0 WHERE id=$1`,[loserPairId]);
  const cat=(await q(client,`SELECT c.number,p.position,(SELECT max(position) FROM pairs x WHERE x.category_id=p.category_id AND x.competition_state='active') last_position,p.consecutive_wins,p.consecutive_losses,p.category_id FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[winnerPairId])).rows[0];
  if(Number(cat.number)===1 && Number(cat.position)===1 && winnerWasFirst){await q(client,`UPDATE pairs SET first_place_defenses=first_place_defenses+1 WHERE id=$1`,[winnerPairId]);}
  if(Number(cat.position)===1&&Number(cat.consecutive_wins)>=3&&Number(cat.number)>1)await moveCategory(client,{id:winnerPairId},-1,key);
  const los=(await q(client,`SELECT c.number,p.position,(SELECT max(position) FROM pairs x WHERE x.category_id=p.category_id AND x.competition_state='active') last_position,p.consecutive_losses,p.category_id,(SELECT count(*) FROM pairs x WHERE x.category_id=p.category_id AND x.competition_state='active') current_active_count,(SELECT count(*) FROM pairs x JOIN categories lc ON lc.id=x.category_id WHERE lc.league_id=c.league_id AND lc.number=c.number+1 AND x.competition_state='active') lower_active_count FROM pairs p JOIN categories c ON c.id=p.category_id WHERE p.id=$1`,[loserPairId])).rows[0];
  const relegationThreshold=relegationLossThreshold({categoryNumber:Number(los.number),currentActiveCount:Number(los.current_active_count),lowerActiveCount:Number(los.lower_active_count)});
  if(Number(los.position)===Number(los.last_position)&&Number(los.consecutive_losses)>=relegationThreshold&&Number(los.number)<7)await moveCategory(client,{id:loserPairId},1,key);
  await recalcCategoryElos(client,assignment.category_id);
  const leader=(await q(client,`SELECT p.id,p.elo,p.first_place_defenses,l.id league_id,c.number FROM pairs p JOIN categories c ON c.id=p.category_id JOIN leagues l ON l.id=p.league_id WHERE p.category_id=$1 AND p.competition_state='active' ORDER BY p.position LIMIT 1`,[assignment.category_id])).rows[0];
  if(leader&&Number(leader.number)===1){const name=await pairName(client,leader.id);await q(client,`INSERT INTO elo_record_history(league_id,pair_id,pair_name,elo,defenses,achieved_at) VALUES($1,$2,$3,$4,$5,$6)`,[leader.league_id,leader.id,name,leader.elo,leader.first_place_defenses,playedAt]);}
  await event(client,`${key}:confirmed`,'match_confirmed',{pairId:winnerPairId,assignmentId:assignment.id,data:{winnerPairId,loserPairId,resultType}});
  return match;
}
