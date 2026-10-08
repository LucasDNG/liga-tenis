import {q} from './db.js';
import {formationComplete,planCategoryWheel,shouldCancelAssignmentForStructure,resultAllowedAfterCancellation,resultCountsAsReal,roleAfterRealMatch,promotionStateAfterResult,relegationStateAfterResult,populationDirectionalThreshold,entryPositionPenultimate,descendedEntryPosition,individualCategoriesAfterDescent,failureStateAfterClosure,roleAfterOwnFailure,administrativeFailureMovement,fullCalendarMonthsBetween,inactivityReturnPosition,simultaneousOnePlacePenalty,categoryForReformedPair} from './wheelV3Rules.js';
import {scoreGames,resultEquals,normalizeScore} from './core.js';
import {queuePairNotification,queueAssignmentNotification} from './notifications.js';

export async function wheelV3FormationSnapshot(client,leagueId,{lock=false}={}){
  if(lock){
    await q(client,`SELECT id FROM categories WHERE league_id=$1 ORDER BY number FOR UPDATE`,[leagueId]);
  }
  const rows=(await q(client,`
    SELECT c.id,c.number,count(p.id) FILTER (WHERE p.competition_state='active')::int active_count
    FROM categories c
    LEFT JOIN pairs p ON p.category_id=c.id
    WHERE c.league_id=$1
    GROUP BY c.id,c.number
    ORDER BY c.number
  `,[leagueId])).rows;
  if(rows.length!==7)throw new Error('Wheel v3 requiere exactamente 7 categorías por circuito');
  return {
    categories:rows,
    complete:formationComplete(rows.map(r=>Number(r.active_count))),
  };
}

export async function wheelV3CategoryPlanningRows(client,categoryId,{lock=false}={}){
  const rows=(await q(client,`
    SELECT
      p.id,
      p.position,
      p.competition_state='active' AS active,
      (
        NOT EXISTS(SELECT 1 FROM wheel_assignment_participants wap WHERE wap.pair_id=p.id)
        AND p.discipline_state='clear'
        AND NOT EXISTS(
          SELECT 1
          FROM pair_members pm
          JOIN users u ON u.id=pm.user_id
          WHERE pm.pair_id=p.id AND u.discipline_state<>'clear'
        )
        AND NOT EXISTS(
          SELECT 1
          FROM pair_dissolution_requests d
          WHERE d.pair_id=p.id AND d.status IN('pending','confirmed','awaiting_result')
        )
      ) AS free,
      pws.role,
      pws.role_streak,
      pws.defense_required_until_real,
      COALESCE(pws.real_waiting_since,p.created_at) AS real_waiting_since,
      pds.pending_relegation_category_id,
      COALESCE(pds.relegation_route_step,0) AS relegation_route_step
    FROM pairs p
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    LEFT JOIN LATERAL (
      SELECT min(pm.user_id) member_low_id,max(pm.user_id) member_high_id,count(*) member_count
      FROM pair_members pm
      WHERE pm.pair_id=p.id
    ) members ON true
    LEFT JOIN pair_duo_state pds
      ON members.member_count=2
     AND pds.league_id=p.league_id
     AND pds.member_low_id=members.member_low_id
     AND pds.member_high_id=members.member_high_id
    WHERE p.category_id=$1
      AND p.competition_state='active'
    ORDER BY p.position,p.id
    ${lock?'FOR UPDATE OF p,pws':''}
  `,[categoryId])).rows;
  return rows.map(r=>({
    id:Number(r.id),
    position:Number(r.position),
    active:Boolean(r.active),
    free:Boolean(r.free),
    role:r.role,
    roleStreak:Number(r.role_streak),
    defenseRequiredUntilReal:Boolean(r.defense_required_until_real),
    realWaitingSince:r.real_waiting_since,
    relegationActive:Number(r.pending_relegation_category_id)===Number(categoryId),
    relegationRouteStep:Number(r.relegation_route_step||0),
  }));
}

export async function wheelV3LastOpponentMap(client,pairIds){
  const ids=[...new Set(pairIds.map(Number))];
  if(!ids.length)return {};
  const rows=(await q(client,`
    WITH ranked AS (
      SELECT
        x.pair_id,
        x.opponent_id,
        row_number() OVER(
          PARTITION BY x.pair_id
          ORDER BY x.played_at DESC,x.match_id DESC
        ) rn
      FROM (
        SELECT m.id match_id,m.played_at,m.pair_a_id pair_id,m.pair_b_id opponent_id
        FROM matches m
        WHERE m.pair_a_id=ANY($1::bigint[])
          AND m.result_type IN('normal','injury_abandonment')
        UNION ALL
        SELECT m.id match_id,m.played_at,m.pair_b_id pair_id,m.pair_a_id opponent_id
        FROM matches m
        WHERE m.pair_b_id=ANY($1::bigint[])
          AND m.result_type IN('normal','injury_abandonment')
      ) x
    )
    SELECT pair_id,opponent_id
    FROM ranked
    WHERE rn=1
  `,[ids])).rows;
  return Object.fromEntries(rows.map(r=>[Number(r.pair_id),Number(r.opponent_id)]));
}

export async function planWheelV3Category(client,categoryId,{lock=false}={}){
  const pairs=await wheelV3CategoryPlanningRows(client,categoryId,{lock});
  const lastOpponentByPair=await wheelV3LastOpponentMap(client,pairs.map(p=>p.id));
  return planCategoryWheel(pairs,{lastOpponentByPair});
}


export async function completeWheelV3FormationIfReady(client,leagueId){
  const state=(await q(client,`
    SELECT *
    FROM league_wheel_state
    WHERE league_id=$1
    FOR UPDATE
  `,[leagueId])).rows[0];
  if(!state)throw new Error('Falta league_wheel_state');
  if(state.formation_completed_at)return {completed:false,alreadyCompleted:true,completedAt:state.formation_completed_at};

  const snapshot=await wheelV3FormationSnapshot(client,leagueId);
  if(!snapshot.complete)return {completed:false,alreadyCompleted:false,completedAt:null};

  const initializedZones=await initializeWheelV3FormationZones(client,leagueId);
  const row=(await q(client,`
    UPDATE league_wheel_state
    SET formation_completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
    WHERE league_id=$1 AND formation_completed_at IS NULL
    RETURNING formation_completed_at
  `,[leagueId])).rows[0];
  if(row){
    const pairIds=(await q(client,`
      SELECT id FROM pairs
      WHERE league_id=$1 AND competition_state<>'inactive'
      ORDER BY id
    `,[leagueId])).rows.map(r=>Number(r.id));
    for(const pairId of pairIds){
      await queuePairNotification(client,pairId,{
        type:'formation_completed',
        title:'Terminó la fase de formación',
        body:'El circuito completó su fase de formación. Desde ahora quedan habilitados ascensos y descensos.',
        payload:{leagueId,completedAt:row.formation_completed_at},
        dedupeKey:`v3-formation:${leagueId}`,
      });
    }
  }
  return {
    completed:Boolean(row),
    alreadyCompleted:false,
    completedAt:row?.formation_completed_at??null,
    initializedZones,
  };
}

export async function persistWheelV3PlannedRoles(client,pairs){
  for(const pair of pairs){
    await q(client,`
      UPDATE pair_wheel_state
      SET role=$2::varchar,role_streak=$3,updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[
      pair.id,
      pair.role,
      Number(pair.roleStreak)||0,
    ]);
  }
}

export async function createWheelV3AssignmentsForCategory(client,categoryId){
  const category=(await q(client,`
    SELECT id,league_id
    FROM categories
    WHERE id=$1
    FOR UPDATE
  `,[categoryId])).rows[0];
  if(!category)throw new Error('Categoría inexistente');

  const plan=await planWheelV3Category(client,categoryId,{lock:true});
  await persistWheelV3PlannedRoles(client,plan.pairs);

  const created=[];
  for(const item of plan.assignments){
    const attacker=plan.pairs.find(p=>p.id===item.attackerId);
    const defender=plan.pairs.find(p=>p.id===item.defenderId);
    if(!attacker||!defender)continue;
    if(!attacker.free||!defender.free)continue;

    const assignment=(await q(client,`
      INSERT INTO wheel_assignments(
        league_id,
        category_id,
        pair_a_id,
        pair_b_id,
        attacker_pair_id,
        defender_pair_id
      )
      VALUES($1,$2,$3,$4,$3,$4)
      RETURNING *
    `,[
      category.league_id,
      category.id,
      attacker.id,
      defender.id,
    ])).rows[0];

    await q(client,`
      INSERT INTO wheel_assignment_participants(assignment_id,pair_id)
      VALUES($1,$2),($1,$3)
    `,[assignment.id,attacker.id,defender.id]);

    const categoryNumber=Number((await q(client,`SELECT number FROM categories WHERE id=$1`,[category.id])).rows[0]?.number);
    if(categoryNumber===1&&Number(defender.position)===1){
      const reign=await wheelV3OpenReign(client,category.league_id,defender.id);
      const linked=(await q(client,`
        UPDATE wheel_assignments
        SET first_place_reign_id=$2
        WHERE id=$1
        RETURNING *
      `,[assignment.id,reign.id])).rows[0];
      Object.assign(assignment,linked);
    }

    await queueAssignmentNotification(client,assignment,{
      type:'assignment_created',
      title:'Nuevo partido asignado',
      body:'LA RED asignó automáticamente tu próximo partido. Tenés 30 días para jugar y cargar el resultado.',
      payload:{assignmentId:assignment.id,deadlineAt:assignment.deadline_at},
      dedupeKey:`v3-assignment:${assignment.id}`,
    });
    created.push(assignment);
  }
  return {plan,created};
}


export async function cancelInvalidWheelV3AssignmentsForCategory(client,categoryId){
  await q(client,`SELECT id FROM categories WHERE id=$1 FOR UPDATE`,[categoryId]);
  const rows=(await q(client,`
    SELECT
      wa.*,
      attacker.category_id attacker_category_id,
      attacker.position attacker_position,
      defender.category_id defender_category_id,
      defender.position defender_position
    FROM wheel_assignments wa
    JOIN pairs attacker ON attacker.id=wa.attacker_pair_id
    JOIN pairs defender ON defender.id=wa.defender_pair_id
    WHERE wa.category_id=$1
      AND wa.status IN('open','result_pending')
    ORDER BY wa.id
    FOR UPDATE OF wa
  `,[categoryId])).rows;

  const cancelled=[];
  for(const row of rows){
    const shouldCancel=shouldCancelAssignmentForStructure({
      hasFirstResult:Boolean(row.first_result_at),
      attackerCategory:row.attacker_category_id,
      defenderCategory:row.defender_category_id,
      attackerPosition:row.attacker_position,
      defenderPosition:row.defender_position,
    });
    if(!shouldCancel)continue;

    const reason=Number(row.attacker_category_id)!==Number(row.defender_category_id)
      ?'system_category_cancel'
      :'system_ranking_cancel';

    const closed=(await q(client,`
      UPDATE wheel_assignments
      SET
        status='cancelled',
        cancelled_at=CURRENT_TIMESTAMP,
        closed_at=CURRENT_TIMESTAMP,
        close_reason=$2
      WHERE id=$1
        AND first_result_at IS NULL
        AND status IN('open','result_pending')
      RETURNING *
    `,[row.id,reason])).rows[0];
    if(!closed)continue;

    await q(client,`DELETE FROM wheel_assignment_participants WHERE assignment_id=$1`,[row.id]);
    await wheelV3ResolveNoShowOnAssignmentClose(client,row.id);
    await queueAssignmentNotification(client,row,{
      type:'assignment_cancelled',
      title:'Partido competitivo cancelado',
      body:'El ranking o la categoría cambió y este cruce dejó de ser competitivo. LA RED buscará un nuevo rival.',
      payload:{assignmentId:row.id,reason},
      dedupeKey:`v3-cancel:${row.id}`,
    });
    cancelled.push(closed);
  }
  return cancelled;
}

export async function registerWheelV3FirstResult(client,assignmentId){
  const row=(await q(client,`
    UPDATE wheel_assignments
    SET
      first_result_at=COALESCE(first_result_at,CURRENT_TIMESTAMP),
      confirmation_deadline_at=COALESCE(confirmation_deadline_at,CURRENT_TIMESTAMP+interval '7 days'),
      status='result_pending',
      closed_at=CASE WHEN status='cancelled' THEN NULL ELSE closed_at END,
      close_reason=CASE WHEN status='cancelled' THEN NULL ELSE close_reason END
    WHERE id=$1
      AND status IN('open','result_pending','cancelled')
    RETURNING *
  `,[assignmentId])).rows[0];
  if(!row)throw new Error('Assignment no disponible para primera carga');
  return row;
}

export async function wheelV3CancelledResultEligibility(client,assignmentId,playedAt){
  const row=(await q(client,`
    SELECT id,cancelled_at,status
    FROM wheel_assignments
    WHERE id=$1
  `,[assignmentId])).rows[0];
  if(!row)throw new Error('Assignment inexistente');
  if(row.status!=='cancelled')return {eligible:true,cancelledAt:row.cancelled_at};
  return {
    eligible:resultAllowedAfterCancellation({playedAt,cancelledAt:row.cancelled_at}),
    cancelledAt:row.cancelled_at,
  };
}


async function wheelV3RealMatchCountForPair(client,pairId){
  const row=(await q(client,`
    SELECT count(*)::int n
    FROM matches
    WHERE (pair_a_id=$1 OR pair_b_id=$1)
      AND result_type IN('normal','injury_abandonment')
  `,[pairId])).rows[0];
  return Number(row?.n||0);
}

async function wheelV3DuoStateIdForPair(client,pairId){
  const row=(await q(client,`
    SELECT pds.id
    FROM pairs p
    JOIN LATERAL (
      SELECT min(pm.user_id) member_low_id,max(pm.user_id) member_high_id,count(*) member_count
      FROM pair_members pm
      WHERE pm.pair_id=p.id
    ) members ON true
    JOIN pair_duo_state pds
      ON pds.league_id=p.league_id
     AND pds.member_low_id=members.member_low_id
     AND pds.member_high_id=members.member_high_id
    WHERE p.id=$1
      AND members.member_count=2
  `,[pairId])).rows[0];
  if(!row)throw new Error('Falta pair_duo_state para pareja');
  return Number(row.id);
}

export async function initializeWheelV3FormationZones(client,leagueId){
  const categories=(await q(client,`
    SELECT id,number
    FROM categories
    WHERE league_id=$1
    ORDER BY number
    FOR UPDATE
  `,[leagueId])).rows;
  const initialized=[];

  for(const category of categories){
    const active=(await q(client,`
      SELECT id,position
      FROM pairs
      WHERE category_id=$1 AND competition_state='active'
      ORDER BY position,id
      FOR UPDATE
    `,[category.id])).rows;
    if(!active.length)continue;

    const top=active[0];
    const bottom=active.at(-1);

    if(Number(category.number)>=2){
      const realMatches=await wheelV3RealMatchCountForPair(client,top.id);
      await q(client,`
        UPDATE pair_wheel_state
        SET
          promotion_wins=0,
          awaiting_zone_first_match=$2,
          awaiting_zone_kind=CASE WHEN $2 THEN 'promotion' ELSE NULL END,
          updated_at=CURRENT_TIMESTAMP
        WHERE pair_id=$1
      `,[top.id,realMatches===0]);
      initialized.push({pairId:Number(top.id),zone:'promotion',awaitingFirstMatch:realMatches===0});
    }

    if(Number(category.number)<=6){
      const realMatches=await wheelV3RealMatchCountForPair(client,bottom.id);
      if(realMatches===0){
        await q(client,`
          UPDATE pair_wheel_state
          SET
            awaiting_zone_first_match=true,
            awaiting_zone_kind='relegation',
            updated_at=CURRENT_TIMESTAMP
          WHERE pair_id=$1
        `,[bottom.id]);
      }else{
        const duoStateId=await wheelV3DuoStateIdForPair(client,bottom.id);
        await q(client,`
          UPDATE pair_duo_state
          SET
            pending_relegation_category_id=$2,
            pending_relegation_losses=0,
            relegation_route_step=0,
            pending_relegation_started_at=COALESCE(pending_relegation_started_at,CURRENT_TIMESTAMP),
            updated_at=CURRENT_TIMESTAMP
          WHERE id=$1
            AND pending_relegation_category_id IS NULL
        `,[duoStateId,category.id]);
      }
      initialized.push({pairId:Number(bottom.id),zone:'relegation',awaitingFirstMatch:realMatches===0});
    }
  }
  return initialized;
}

export async function refreshWheelV3Category(client,categoryId){
  const cancelled=await cancelInvalidWheelV3AssignmentsForCategory(client,categoryId);
  const assignmentResult=await createWheelV3AssignmentsForCategory(client,categoryId);
  return {cancelled,created:assignmentResult.created,plan:assignmentResult.plan};
}


async function wheelV3MovementEvent(client,{
  sourceKey,
  pairId,
  assignmentId=null,
  reason,
  fromPosition=null,
  toPosition=null,
  fromCategory=null,
  toCategory=null,
}){
  const row=(await q(client,`
    INSERT INTO competitive_events(source_key,event_type,pair_id,assignment_id,data)
    VALUES($1,'wheel_v3_movement',$2,$3,$4::jsonb)
    ON CONFLICT(source_key) DO NOTHING
    RETURNING *
  `,[
    sourceKey,
    pairId,
    assignmentId,
    JSON.stringify({
      reason,
      fromPosition,
      toPosition,
      fromCategory,
      toCategory,
    }),
  ])).rows[0]||null;
  if(row){
    const detail=fromCategory!=null&&toCategory!=null
      ?`${fromCategory}ª → ${toCategory}ª`
      :fromPosition!=null&&toPosition!=null
        ?`#${fromPosition} → #${toPosition}`
        :'Tu posición competitiva cambió.';
    await queuePairNotification(client,pairId,{
      type:'wheel_v3_movement',
      title:'Movimiento en LA RED',
      body:`Se actualizó tu posición: ${detail}`,
      payload:{reason,fromPosition,toPosition,fromCategory,toCategory,assignmentId},
      dedupeKey:`v3-movement:${sourceKey}`,
    });
  }
  return row;
}

export async function wheelV3RecentMovements(client,pairId){
  return (await q(client,`
    SELECT event_type,data,created_at
    FROM competitive_events
    WHERE pair_id=$1
      AND event_type='wheel_v3_movement'
    ORDER BY created_at DESC,id DESC
    LIMIT 5
  `,[pairId])).rows;
}

async function wheelV3CategoryRow(client,categoryId){
  const row=(await q(client,`
    SELECT c.id,c.league_id,c.number
    FROM categories c
    WHERE c.id=$1
  `,[categoryId])).rows[0];
  if(!row)throw new Error('Categoría inexistente');
  return row;
}

async function wheelV3LeagueCounts(client,leagueId){
  const rows=(await q(client,`
    SELECT c.number,count(p.id) FILTER (WHERE p.competition_state='active')::int active_count
    FROM categories c
    LEFT JOIN pairs p ON p.category_id=c.id
    WHERE c.league_id=$1
    GROUP BY c.id,c.number
    ORDER BY c.number
  `,[leagueId])).rows;
  return Array.from({length:7},(_,i)=>Number(rows.find(r=>Number(r.number)===i+1)?.active_count||0));
}

async function wheelV3ActiveOrder(client,categoryId,{excludePairId=null}={}){
  const values=[];
  const params=[categoryId];
  let exclude='';
  if(excludePairId!=null){
    params.push(excludePairId);
    exclude=' AND id<>$2';
  }
  const rows=(await q(client,`
    SELECT id
    FROM pairs
    WHERE category_id=$1
      AND competition_state='active'
      ${exclude}
    ORDER BY position,id
    FOR UPDATE
  `,params)).rows;
  for(const row of rows)values.push(Number(row.id));
  return values;
}

async function wheelV3SetCategoryOrder(client,categoryId,activeOrder){
  const paused=(await q(client,`
    SELECT id
    FROM pairs
    WHERE category_id=$1
      AND competition_state='paused'
      AND NOT (id=ANY($2::bigint[]))
    ORDER BY position,id
    FOR UPDATE
  `,[categoryId,activeOrder.length?activeOrder:[-1]])).rows.map(r=>Number(r.id));
  const all=[...activeOrder,...paused];
  if(!all.length)return;
  const base=900000+all.length;
  for(let i=0;i<all.length;i++)await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[all[i],base+i]);
  for(let i=0;i<all.length;i++)await q(client,`UPDATE pairs SET position=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[all[i],i+1]);
}

async function wheelV3SwapPairPositions(client,winnerPairId,loserPairId){
  const rows=(await q(client,`
    SELECT id,category_id,position
    FROM pairs
    WHERE id=ANY($1::bigint[])
    ORDER BY id
    FOR UPDATE
  `,[[winnerPairId,loserPairId]])).rows;
  if(rows.length!==2)throw new Error('Parejas inexistentes');
  const winner=rows.find(r=>Number(r.id)===Number(winnerPairId));
  const loser=rows.find(r=>Number(r.id)===Number(loserPairId));
  if(Number(winner.category_id)!==Number(loser.category_id))return false;
  if(Number(winner.position)<=Number(loser.position))return false;
  await q(client,`UPDATE pairs SET position=999999 WHERE id=$1`,[winnerPairId]);
  await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[loserPairId,winner.position]);
  await q(client,`UPDATE pairs SET position=$2 WHERE id=$1`,[winnerPairId,loser.position]);
  return true;
}

async function wheelV3ConsumePositionDebt(client,pairIds){
  const ids=[...new Set(pairIds.map(Number))];
  if(!ids.length)return;
  await q(client,`
    UPDATE pairs
    SET position_debt=GREATEST(0,position_debt-1),updated_at=CURRENT_TIMESTAMP
    WHERE id=ANY($1::bigint[])
      AND position_debt>0
  `,[ids]);
}

async function wheelV3MovePairCategory(client,pairId,targetCategoryId,{mode,assignmentId=null,sourceKey=null}={}){
  const pair=(await q(client,`
    SELECT p.*,c.number source_number
    FROM pairs p
    JOIN categories c ON c.id=p.category_id
    WHERE p.id=$1
    FOR UPDATE OF p
  `,[pairId])).rows[0];
  if(!pair)throw new Error('Pareja inexistente');
  const target=await wheelV3CategoryRow(client,targetCategoryId);
  const sourceCategoryId=Number(pair.category_id);
  const sourceOrder=await wheelV3ActiveOrder(client,sourceCategoryId,{excludePairId:pairId});
  const targetOrder=await wheelV3ActiveOrder(client,targetCategoryId,{excludePairId:pairId});
  const desired=mode==='promotion'
    ?entryPositionPenultimate(targetOrder.length)
    :descendedEntryPosition(targetOrder.length);
  const shiftedByInsertion=targetOrder.slice(desired-1);
  targetOrder.splice(desired-1,0,Number(pairId));

  await q(client,`
    UPDATE pairs
    SET category_id=$2,position=999998,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[pairId,targetCategoryId]);
  await wheelV3SetCategoryOrder(client,sourceCategoryId,sourceOrder);
  await wheelV3SetCategoryOrder(client,targetCategoryId,targetOrder);
  await wheelV3ConsumePositionDebt(client,shiftedByInsertion);

  const members=(await q(client,`
    SELECT u.id,u.current_category_number
    FROM pair_members pm
    JOIN users u ON u.id=pm.user_id
    WHERE pm.pair_id=$1
    FOR UPDATE OF u
  `,[pairId])).rows;
  if(mode==='promotion'){
    for(const member of members){
      const current=member.current_category_number==null?null:Number(member.current_category_number);
      const next=current==null?Number(target.number):Math.min(current,Number(target.number));
      await q(client,`UPDATE users SET current_category_number=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[member.id,next]);
    }
  }else{
    const nextValues=individualCategoriesAfterDescent(members.map(m=>m.current_category_number??target.number),Number(target.number));
    for(let i=0;i<members.length;i++){
      await q(client,`UPDATE users SET current_category_number=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[members[i].id,nextValues[i]]);
    }
  }

  await q(client,`
    UPDATE pair_wheel_state
    SET
      role='attack',
      role_streak=1,
      promotion_wins=0,
      awaiting_zone_first_match=false,
      awaiting_zone_kind=NULL,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId]);

  if(mode==='relegation'){
    const duoStateId=await wheelV3DuoStateIdForPair(client,pairId);
    await q(client,`
      UPDATE pair_duo_state
      SET
        pending_relegation_category_id=NULL,
        pending_relegation_losses=0,
        relegation_route_step=0,
        pending_relegation_started_at=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[duoStateId]);
  }

  if(sourceKey){
    await wheelV3MovementEvent(client,{
      sourceKey,
      pairId:Number(pairId),
      assignmentId,
      reason:mode==='promotion'?'promotion':'relegation',
      fromCategory:Number(pair.source_number),
      toCategory:Number(target.number),
    });
  }
  return {
    pairId:Number(pairId),
    fromCategoryId:sourceCategoryId,
    toCategoryId:Number(targetCategoryId),
    from:Number(pair.source_number),
    to:Number(target.number),
    entryPosition:desired,
  };
}

async function wheelV3OpenReign(client,leagueId,pairId){
  const open=(await q(client,`
    SELECT *
    FROM first_place_reigns
    WHERE league_id=$1 AND ended_at IS NULL
    FOR UPDATE
  `,[leagueId])).rows[0];
  if(open&&Number(open.pair_id)===Number(pairId))return open;
  if(open){
    await q(client,`UPDATE first_place_reigns SET ended_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=$1`,[open.id]);
  }
  return (await q(client,`
    INSERT INTO first_place_reigns(league_id,pair_id)
    VALUES($1,$2)
    RETURNING *
  `,[leagueId,pairId])).rows[0];
}

async function wheelV3UpdateFirstPlaceReignAfterRealResult(client,{leagueId,categoryNumber,leaderBefore,leaderAfter,assignment,winnerPairId}){
  if(Number(categoryNumber)!==1)return null;
  if(assignment.first_place_reign_id
    && Number(assignment.defender_pair_id)===Number(winnerPairId)){
    return (await q(client,`
      UPDATE first_place_reigns
      SET defenses=defenses+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
        AND pair_id=$2
      RETURNING *
    `,[assignment.first_place_reign_id,winnerPairId])).rows[0]||null;
  }
  if(!leaderAfter)return null;
  const open=await wheelV3OpenReign(client,leagueId,leaderAfter);
  if(Number(leaderBefore)!==Number(leaderAfter))return open;
  if(Number(assignment.defender_pair_id)!==Number(leaderAfter))return open;
  return (await q(client,`
    UPDATE first_place_reigns
    SET defenses=defenses+1,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *
  `,[open.id])).rows[0];
}


async function wheelV3DuoStateForPair(client,pairId,{lock=false}={}){
  const row=(await q(client,`
    SELECT pds.*
    FROM pairs p
    JOIN LATERAL (
      SELECT min(pm.user_id) member_low_id,max(pm.user_id) member_high_id,count(*) member_count
      FROM pair_members pm
      WHERE pm.pair_id=p.id
    ) members ON true
    JOIN pair_duo_state pds
      ON pds.league_id=p.league_id
     AND pds.member_low_id=members.member_low_id
     AND pds.member_high_id=members.member_high_id
    WHERE p.id=$1
      AND members.member_count=2
    ${lock?'FOR UPDATE OF pds':''}
  `,[pairId])).rows[0];
  if(!row)throw new Error('Falta pair_duo_state para pareja');
  return row;
}

async function wheelV3PairSnapshot(client,pairIds){
  const rows=(await q(client,`
    SELECT
      p.id,
      p.league_id,
      p.category_id,
      p.position,
      pws.role,
      pws.role_streak,
      pws.defense_required_until_real,
      pws.promotion_wins,
      pws.awaiting_zone_first_match,
      pws.awaiting_zone_kind
    FROM pairs p
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    WHERE p.id=ANY($1::bigint[])
    ORDER BY p.id
    FOR UPDATE OF p,pws
  `,[pairIds])).rows;
  return Object.fromEntries(rows.map(r=>[Number(r.id),r]));
}

async function wheelV3ActiveCount(client,categoryId){
  return Number((await q(client,`
    SELECT count(*)::int n
    FROM pairs
    WHERE category_id=$1 AND competition_state='active'
  `,[categoryId])).rows[0]?.n||0);
}

async function wheelV3Leader(client,categoryId){
  return (await q(client,`
    SELECT id
    FROM pairs
    WHERE category_id=$1 AND competition_state='active'
    ORDER BY position,id
    LIMIT 1
  `,[categoryId])).rows[0]?.id??null;
}

async function wheelV3PersistPromotionState(client,pairId,state){
  await q(client,`
    UPDATE pair_wheel_state
    SET
      promotion_wins=$2,
      awaiting_zone_first_match=$3,
      awaiting_zone_kind=CASE WHEN $3 THEN 'promotion' ELSE NULL END,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId,state.wins,Boolean(state.awaitingFirstMatch)]);
}

async function wheelV3PersistRelegationState(client,pairId,categoryId,state){
  const duo=await wheelV3DuoStateForPair(client,pairId,{lock:true});
  if(state.active){
    await q(client,`
      UPDATE pair_duo_state
      SET
        pending_relegation_category_id=$2,
        pending_relegation_losses=$3,
        relegation_route_step=$4,
        pending_relegation_started_at=COALESCE(pending_relegation_started_at,CURRENT_TIMESTAMP),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[duo.id,categoryId,state.losses,state.routeStep]);
  }else{
    await q(client,`
      UPDATE pair_duo_state
      SET
        pending_relegation_category_id=NULL,
        pending_relegation_losses=0,
        relegation_route_step=0,
        pending_relegation_started_at=NULL,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[duo.id]);
  }
}

async function wheelV3ApplyRealRoles(client,assignment,snapshots,categoryId){
  const activeCount=await wheelV3ActiveCount(client,categoryId);
  for(const pairId of [Number(assignment.attacker_pair_id),Number(assignment.defender_pair_id)]){
    const current=(await q(client,`
      SELECT p.position,pws.role,pws.role_streak,pws.defense_required_until_real
      FROM pairs p
      JOIN pair_wheel_state pws ON pws.pair_id=p.id
      WHERE p.id=$1
      FOR UPDATE OF p,pws
    `,[pairId])).rows[0];
    if(!current||Number((await q(client,`SELECT category_id FROM pairs WHERE id=$1`,[pairId])).rows[0].category_id)!==Number(categoryId))continue;
    const next=roleAfterRealMatch({
      previousRole:snapshots[pairId]?.role??current.role,
      wasAttacker:pairId===Number(assignment.attacker_pair_id),
      roleStreak:Number(snapshots[pairId]?.role_streak??current.role_streak??0),
      position:Number(current.position),
      activeCount,
      defenseRequiredUntilReal:Boolean(snapshots[pairId]?.defense_required_until_real),
    });
    await q(client,`
      UPDATE pair_wheel_state
      SET role=$2::varchar,role_streak=$3,defense_required_until_real=$4,updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[pairId,next.role,next.roleStreak,next.defenseRequiredUntilReal]);
  }
}

async function wheelV3ResetFailureStreakAfterRealMatch(client,pairId){
  const duo=await wheelV3DuoStateForPair(client,pairId,{lock:true});
  await q(client,`
    UPDATE pair_duo_state
    SET failure_streak=0,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[duo.id]);
}

export async function applyWheelV3ConfirmedRealResult(client,{
  assignmentId,
  winnerPairId,
  resultType,
  score=null,
  abandonedPairId=null,
  playedAt,
  resolutionSource='wheel-v3',
}){
  if(!resultCountsAsReal(resultType))throw new Error('Wheel v3 real result requiere partido real');
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment)throw new Error('Assignment inexistente');

  const existing=(await q(client,`SELECT * FROM matches WHERE assignment_id=$1`,[assignmentId])).rows[0];
  if(existing)return {match:existing,idempotent:true,movements:[],refresh:[]};

  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const winner=Number(winnerPairId);
  if(!pairIds.includes(winner))throw new Error('Ganador inválido');
  const loser=pairIds.find(id=>id!==winner);

  if(assignment.status==='cancelled'){
    const eligibility=await wheelV3CancelledResultEligibility(client,assignmentId,playedAt);
    if(!eligibility.eligible)throw new Error('El partido fue jugado después de la cancelación');
  }else if(!['open','result_pending','disputed'].includes(assignment.status)){
    throw new Error('Assignment no disponible para confirmar');
  }

  const category=await wheelV3CategoryRow(client,assignment.category_id);
  await q(client,`
    SELECT id
    FROM categories
    WHERE league_id=$1
    ORDER BY number
    FOR UPDATE
  `,[category.league_id]);

  const before=await wheelV3PairSnapshot(client,pairIds);
  const leaderBefore=await wheelV3Leader(client,assignment.category_id);
  const normalizedScore=resultType==='normal'?normalizeScore(score):score;
  const games=scoreGames(normalizedScore);

  const match=(await q(client,`
    INSERT INTO matches(
      assignment_id,league_id,category_number,pair_a_id,pair_b_id,
      winner_pair_id,result_type,score,abandoned_pair_id,
      pair_a_games,pair_b_games,played_at,resolution_source
    )
    VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13)
    RETURNING *
  `,[
    assignment.id,
    assignment.league_id,
    Number(category.number),
    assignment.pair_a_id,
    assignment.pair_b_id,
    winner,
    resultType,
    JSON.stringify(normalizedScore??null),
    abandonedPairId,
    games.a,
    games.b,
    playedAt,
    resolutionSource,
  ])).rows[0];

  const swapped=await wheelV3SwapPairPositions(client,winner,loser);
  if(swapped){
    await wheelV3MovementEvent(client,{
      sourceKey:`v3:assignment:${assignment.id}:swap:${winner}`,
      pairId:winner,
      assignmentId:assignment.id,
      reason:'victory_over_higher_rival',
      fromPosition:Number(before[winner].position),
      toPosition:Number(before[loser].position),
    });
    await wheelV3MovementEvent(client,{
      sourceKey:`v3:assignment:${assignment.id}:swap:${loser}`,
      pairId:loser,
      assignmentId:assignment.id,
      reason:'loss_to_lower_rival',
      fromPosition:Number(before[loser].position),
      toPosition:Number(before[winner].position),
    });
  }
  const leaderAfterSwap=await wheelV3Leader(client,assignment.category_id);

  await wheelV3ApplyRealRoles(client,assignment,before,assignment.category_id);
  await wheelV3ResetFailureStreakAfterRealMatch(client,winner);
  await wheelV3ResetFailureStreakAfterRealMatch(client,loser);

  const formation=(await q(client,`
    SELECT formation_completed_at
    FROM league_wheel_state
    WHERE league_id=$1
    FOR UPDATE
  `,[assignment.league_id])).rows[0];

  const movements=[];
  const affectedCategories=new Set([Number(assignment.category_id)]);

  if(formation?.formation_completed_at){
    const counts=await wheelV3LeagueCounts(client,assignment.league_id);
    const activeCount=await wheelV3ActiveCount(client,assignment.category_id);
    const currentRows=(await q(client,`
      SELECT p.id,p.category_id,p.position,pws.promotion_wins,pws.awaiting_zone_first_match,pws.awaiting_zone_kind
      FROM pairs p
      JOIN pair_wheel_state pws ON pws.pair_id=p.id
      WHERE p.id=ANY($1::bigint[])
      FOR UPDATE OF p,pws
    `,[pairIds])).rows;
    const current=Object.fromEntries(currentRows.map(r=>[Number(r.id),r]));

    const winnerStillHere=Number(current[winner].category_id)===Number(category.id);
    const loserStillHere=Number(current[loser].category_id)===Number(category.id);

    let winnerPromotion={active:false,wins:0,promote:false,awaitingFirstMatch:false};
    let loserPromotion={active:false,wins:0,promote:false,awaitingFirstMatch:false};
    if(winnerStillHere){
      winnerPromotion=promotionStateAfterResult({
        category:Number(category.number),
        position:Number(current[winner].position),
        activeCount,
        currentWins:Number(current[winner].promotion_wins||0),
        isRealMatch:true,
        won:true,
        threshold:Number(category.number)>1
          ?populationDirectionalThreshold(counts,Number(category.number)-1,Number(category.number)-2)
          :3,
        awaitingFirstMatch:Boolean(current[winner].awaiting_zone_first_match)&&current[winner].awaiting_zone_kind==='promotion',
        wasNumberOneBefore:Number(before[winner].category_id)===Number(category.id)&&Number(before[winner].position)===1,
      });
      await wheelV3PersistPromotionState(client,winner,winnerPromotion);
    }
    if(loserStillHere){
      loserPromotion=promotionStateAfterResult({
        category:Number(category.number),
        position:Number(current[loser].position),
        activeCount,
        currentWins:Number(current[loser].promotion_wins||0),
        isRealMatch:true,
        won:false,
        threshold:3,
        awaitingFirstMatch:Boolean(current[loser].awaiting_zone_first_match)&&current[loser].awaiting_zone_kind==='promotion',
        wasNumberOneBefore:Number(before[loser].category_id)===Number(category.id)&&Number(before[loser].position)===1,
      });
      await wheelV3PersistPromotionState(client,loser,loserPromotion);
    }

    let winnerRelegation={active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
    let loserRelegation={active:false,losses:0,routeStep:0,descend:false,awaitingFirstMatch:false};
    if(Number(category.number)<7){
      const threshold=populationDirectionalThreshold(counts,Number(category.number)-1,Number(category.number));
      if(winnerStillHere){
        const winnerDuo=await wheelV3DuoStateForPair(client,winner,{lock:true});
        winnerRelegation=relegationStateAfterResult({
          category:Number(category.number),
          wasInRelegation:Number(winnerDuo.pending_relegation_category_id)===Number(category.id),
          losses:Number(winnerDuo.pending_relegation_losses||0),
          routeStep:Number(winnerDuo.relegation_route_step||0),
          isRealMatch:true,
          won:true,
          isLast:Number(current[winner].position)===activeCount,
          threshold,
          awaitingFirstMatch:Boolean(current[winner].awaiting_zone_first_match)&&current[winner].awaiting_zone_kind==='relegation',
        });
        await wheelV3PersistRelegationState(client,winner,category.id,winnerRelegation);
        if(current[winner].awaiting_zone_kind==='relegation'){
          await q(client,`UPDATE pair_wheel_state SET awaiting_zone_first_match=false,awaiting_zone_kind=NULL WHERE pair_id=$1`,[winner]);
        }
      }
      if(loserStillHere){
        const loserDuo=await wheelV3DuoStateForPair(client,loser,{lock:true});
        loserRelegation=relegationStateAfterResult({
          category:Number(category.number),
          wasInRelegation:Number(loserDuo.pending_relegation_category_id)===Number(category.id),
          losses:Number(loserDuo.pending_relegation_losses||0),
          routeStep:Number(loserDuo.relegation_route_step||0),
          isRealMatch:true,
          won:false,
          isLast:Number(current[loser].position)===activeCount,
          threshold,
          awaitingFirstMatch:Boolean(current[loser].awaiting_zone_first_match)&&current[loser].awaiting_zone_kind==='relegation',
        });
        await wheelV3PersistRelegationState(client,loser,category.id,loserRelegation);
        if(current[loser].awaiting_zone_kind==='relegation'){
          await q(client,`UPDATE pair_wheel_state SET awaiting_zone_first_match=false,awaiting_zone_kind=NULL WHERE pair_id=$1`,[loser]);
        }
      }
    }

    if(winnerPromotion.promote&&Number(category.number)>1){
      const target=(await q(client,`
        SELECT id FROM categories
        WHERE league_id=$1 AND number=$2
      `,[category.league_id,Number(category.number)-1])).rows[0];
      const movement=await wheelV3MovePairCategory(client,winner,target.id,{mode:'promotion',assignmentId:assignment.id,sourceKey:`v3:assignment:${assignment.id}:promotion:${winner}`});
      movements.push({...movement,type:'promotion'});
      affectedCategories.add(Number(target.id));
    }

    if(loserRelegation.descend&&Number(category.number)<7){
      const target=(await q(client,`
        SELECT id FROM categories
        WHERE league_id=$1 AND number=$2
      `,[category.league_id,Number(category.number)+1])).rows[0];
      const movement=await wheelV3MovePairCategory(client,loser,target.id,{mode:'relegation',assignmentId:assignment.id,sourceKey:`v3:assignment:${assignment.id}:relegation:${loser}`});
      movements.push({...movement,type:'relegation'});
      affectedCategories.add(Number(target.id));
    }
  }

  if(Number(category.number)===1){
    const leaderAfter=await wheelV3Leader(client,assignment.category_id);
    await wheelV3UpdateFirstPlaceReignAfterRealResult(client,{
      leagueId:assignment.league_id,
      categoryNumber:Number(category.number),
      leaderBefore,
      leaderAfter,
      assignment,
      winnerPairId:winner,
    });
  }

  await q(client,`
    UPDATE wheel_assignments
    SET status='confirmed',closed_at=CURRENT_TIMESTAMP,close_reason='result_confirmed'
    WHERE id=$1
  `,[assignment.id]);
  await q(client,`DELETE FROM wheel_assignment_participants WHERE assignment_id=$1`,[assignment.id]);
  await wheelV3ResolveNoShowOnAssignmentClose(client,assignment.id);
  await applyPendingWheelV3Dissolutions(client,pairIds);
  await applyPendingWheelV3Pauses(client,pairIds);

  const refresh=[];
  for(const categoryId of [...affectedCategories].sort((a,b)=>a-b)){
    refresh.push({categoryId,...await refreshWheelV3Category(client,categoryId)});
  }
  await queueAssignmentNotification(client,assignment,{
    type:'result_confirmed',
    title:'Resultado confirmado',
    body:'El resultado ya es oficial y LA RED actualizó la rueda.',
    payload:{assignmentId:assignment.id,winnerPairId:winner,resolutionSource},
    dedupeKey:`v3-result-confirmed:${assignment.id}`,
  });

  return {
    match,
    idempotent:false,
    swapped,
    movements,
    refresh,
    leaderBefore:leaderBefore==null?null:Number(leaderBefore),
    leaderAfter:leaderAfterSwap==null?null:Number(leaderAfterSwap),
  };
}


async function wheelV3CurrentPairRow(client,pairId){
  return (await q(client,`
    SELECT p.id,p.league_id,p.category_id,p.position,p.competition_state,c.number category_number
    FROM pairs p
    JOIN categories c ON c.id=p.category_id
    WHERE p.id=$1
    FOR UPDATE OF p
  `,[pairId])).rows[0];
}

async function wheelV3ApplyFailureStreak(client,pairId,{ownFailure=false,rivalOnlyFailure=false}={}){
  const duo=await wheelV3DuoStateForPair(client,pairId,{lock:true});
  const next=failureStateAfterClosure({
    failureStreak:Number(duo.failure_streak||0),
    ownFailure,
    rivalOnlyFailure,
  });
  await q(client,`
    UPDATE pair_duo_state
    SET failure_streak=$2,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[duo.id,next.failureStreak]);
  return {...next,duoId:Number(duo.id)};
}

async function wheelV3ApplyThirtyDayPenalty(client,pairId,duoId){
  const pair=await wheelV3CurrentPairRow(client,pairId);
  await q(client,`
    UPDATE pairs
    SET competition_state='paused',updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[pairId]);
  await q(client,`
    UPDATE pair_wheel_state
    SET
      inactive_since=CURRENT_TIMESTAMP,
      return_position_base=$2,
      inactive_reason='three_failures',
      auto_reactivate_at=CURRENT_TIMESTAMP+interval '30 days',
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId,pair.position]);
  const duo=(await q(client,`
    UPDATE pair_duo_state
    SET penalty_until=CURRENT_TIMESTAMP+interval '30 days',updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING penalty_until
  `,[duoId])).rows[0];
  await queuePairNotification(client,pairId,{
    type:'failure_sanction',
    title:'30 días sin asignaciones',
    body:'La pareja alcanzó 3 incumplimientos consecutivos y queda inactiva durante 30 días.',
    payload:{pairId,penaltyUntil:duo.penalty_until},
    dedupeKey:`v3-sanction:${duoId}:${new Date(duo.penalty_until).toISOString()}`,
  });
  const activeOrder=await wheelV3ActiveOrder(client,pair.category_id);
  await wheelV3SetCategoryOrder(client,pair.category_id,activeOrder);
}

async function wheelV3EnsurePromotionZoneAtCurrentTop(client,pairId,{wasNumberOneBefore=false}={}){
  const pair=await wheelV3CurrentPairRow(client,pairId);
  if(Number(pair.category_number)<=1)return;
  if(Number(pair.position)!==1||wasNumberOneBefore)return;
  await q(client,`
    UPDATE pair_wheel_state
    SET promotion_wins=0,awaiting_zone_first_match=false,awaiting_zone_kind=NULL,updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId]);
}

async function wheelV3SyncFirstPlaceReign(client,leagueId,categoryId){
  const category=await wheelV3CategoryRow(client,categoryId);
  if(Number(category.number)!==1)return null;
  const leader=await wheelV3Leader(client,categoryId);
  if(!leader)return null;
  return wheelV3OpenReign(client,leagueId,leader);
}

async function wheelV3AdministrativeRelegationDecision(client,pairId,{ownFailure}){
  const pair=await wheelV3CurrentPairRow(client,pairId);
  if(Number(pair.category_number)>=7)return {descend:false};
  const formation=(await q(client,`
    SELECT formation_completed_at FROM league_wheel_state
    WHERE league_id=$1
    FOR UPDATE
  `,[pair.league_id])).rows[0];
  if(!formation?.formation_completed_at)return {descend:false};

  const activeCount=await wheelV3ActiveCount(client,pair.category_id);
  const isLast=Number(pair.position)===activeCount;
  const duo=await wheelV3DuoStateForPair(client,pairId,{lock:true});
  const counts=await wheelV3LeagueCounts(client,pair.league_id);
  const threshold=populationDirectionalThreshold(counts,Number(pair.category_number)-1,Number(pair.category_number));
  const state=relegationStateAfterResult({
    category:Number(pair.category_number),
    wasInRelegation:Number(duo.pending_relegation_category_id)===Number(pair.category_id),
    losses:Number(duo.pending_relegation_losses||0),
    routeStep:Number(duo.relegation_route_step||0),
    isRealMatch:false,
    won:false,
    ownFailure,
    isLast,
    threshold,
    awaitingFirstMatch:false,
  });
  await wheelV3PersistRelegationState(client,pairId,pair.category_id,state);
  return state;
}

async function wheelV3CountAdministrativeFirstPlaceDefense(client,{assignment,winnerPairId,countsAsFirstPlaceDefense}){
  if(!countsAsFirstPlaceDefense)return null;
  if(Number(assignment.defender_pair_id)!==Number(winnerPairId))return null;
  if(assignment.first_place_reign_id){
    return (await q(client,`
      UPDATE first_place_reigns
      SET defenses=defenses+1,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND pair_id=$2
      RETURNING *
    `,[assignment.first_place_reign_id,winnerPairId])).rows[0]||null;
  }
  const pair=await wheelV3CurrentPairRow(client,winnerPairId);
  if(Number(pair.category_number)!==1||Number(pair.position)!==1)return null;
  const reign=await wheelV3OpenReign(client,pair.league_id,winnerPairId);
  return (await q(client,`
    UPDATE first_place_reigns
    SET defenses=defenses+1,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *
  `,[reign.id])).rows[0];
}

export async function applyWheelV3OneSidedFailure(client,{
  assignmentId,
  failingPairId,
  reportedByUserId=null,
  resolutionSource='self_failure',
  countsAsFirstPlaceDefense=false,
}){
  const assignment=(await q(client,`
    SELECT * FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment)throw new Error('Assignment inexistente');
  if(!['open','result_pending','disputed'].includes(assignment.status))throw new Error('Assignment no disponible');
  if(resolutionSource==='self_failure'&&(assignment.status!=='open'||assignment.first_result_at)){
    throw new Error('No se puede informar incumplimiento después de cargar un resultado');
  }

  const existing=(await q(client,`SELECT * FROM matches WHERE assignment_id=$1`,[assignmentId])).rows[0];
  if(existing)return {match:existing,idempotent:true,movements:[],refresh:[]};

  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const failing=Number(failingPairId);
  if(!pairIds.includes(failing))throw new Error('Pareja incumplidora inválida');
  const winner=pairIds.find(id=>id!==failing);

  const category=await wheelV3CategoryRow(client,assignment.category_id);
  await q(client,`
    SELECT id FROM categories
    WHERE league_id=$1
    ORDER BY number
    FOR UPDATE
  `,[category.league_id]);

  const before=await wheelV3PairSnapshot(client,pairIds);
  const failingBefore=before[failing];
  const winnerBefore=before[winner];

  const gamesA=Number(assignment.pair_a_id)===winner?12:0;
  const gamesB=Number(assignment.pair_b_id)===winner?12:0;
  const match=(await q(client,`
    INSERT INTO matches(
      assignment_id,league_id,category_number,pair_a_id,pair_b_id,
      winner_pair_id,result_type,score,abandoned_pair_id,
      pair_a_games,pair_b_games,played_at,resolution_source
    )
    VALUES(
      $1,$2,$3,$4,$5,$6,'administrative_forfeit',
      $7::jsonb,NULL,$8,$9,CURRENT_TIMESTAMP,$10
    )
    RETURNING *
  `,[
    assignment.id,
    assignment.league_id,
    Number(category.number),
    assignment.pair_a_id,
    assignment.pair_b_id,
    winner,
    JSON.stringify({sets:[
      {kind:'set',pairA:Number(assignment.pair_a_id)===winner?6:0,pairB:Number(assignment.pair_b_id)===winner?6:0},
      {kind:'set',pairA:Number(assignment.pair_a_id)===winner?6:0,pairB:Number(assignment.pair_b_id)===winner?6:0},
    ]}),
    gamesA,
    gamesB,
    resolutionSource,
  ])).rows[0];

  const movement=administrativeFailureMovement({
    failingPosition:Number(failingBefore.position),
    rivalPosition:Number(winnerBefore.position),
  });
  let swapped=false;
  if(movement.moved){
    swapped=await wheelV3SwapPairPositions(client,winner,failing);
    if(swapped){
      await wheelV3MovementEvent(client,{
        sourceKey:`v3:assignment:${assignment.id}:admin-swap:${failing}`,
        pairId:failing,
        assignmentId:assignment.id,
        reason:'administrative_failure',
        fromPosition:Number(failingBefore.position),
        toPosition:Number(winnerBefore.position),
      });
      await wheelV3MovementEvent(client,{
        sourceKey:`v3:assignment:${assignment.id}:admin-swap:${winner}`,
        pairId:winner,
        assignmentId:assignment.id,
        reason:'rival_administrative_failure',
        fromPosition:Number(winnerBefore.position),
        toPosition:Number(failingBefore.position),
      });
    }
  }

  const activeCount=await wheelV3ActiveCount(client,assignment.category_id);
  const failingNow=await wheelV3CurrentPairRow(client,failing);
  const role=roleAfterOwnFailure({
    previousRole:failingBefore.role,
    position:Number(failingNow.position),
    activeCount,
  });
  await q(client,`
    UPDATE pair_wheel_state
    SET
      role=$2::varchar,
      role_streak=CASE WHEN role=$2::varchar THEN role_streak+1 ELSE 1 END,
      defense_required_until_real=$3,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[failing,role.role,role.defenseRequiredUntilReal]);

  const failingFailure=await wheelV3ApplyFailureStreak(client,failing,{ownFailure:true});
  await wheelV3ApplyFailureStreak(client,winner,{rivalOnlyFailure:true});

  await wheelV3SyncPromotionEdgeAfterAdministrativeMovement(client,assignment.category_id,Number(before[Number(assignment.pair_a_id)]?.position)===1?Number(assignment.pair_a_id):Number(before[Number(assignment.pair_b_id)]?.position)===1?Number(assignment.pair_b_id):null);
  const relegation=await wheelV3AdministrativeRelegationDecision(client,failing,{ownFailure:true});

  const movements=[];
  const affectedCategories=new Set([Number(assignment.category_id)]);
  if(relegation.descend&&Number(category.number)<7){
    const target=(await q(client,`
      SELECT id FROM categories
      WHERE league_id=$1 AND number=$2
    `,[category.league_id,Number(category.number)+1])).rows[0];
    const moved=await wheelV3MovePairCategory(client,failing,target.id,{mode:'relegation',assignmentId:assignment.id,sourceKey:`v3:assignment:${assignment.id}:admin-relegation:${failing}`});
    movements.push({...moved,type:'relegation'});
    affectedCategories.add(Number(target.id));
  }

  if(failingFailure.penalty30Days){
    await wheelV3ApplyThirtyDayPenalty(client,failing,failingFailure.duoId);
  }

  if(Number(category.number)===1){
    await wheelV3SyncFirstPlaceReign(client,assignment.league_id,assignment.category_id);
  }
  await wheelV3CountAdministrativeFirstPlaceDefense(client,{
    assignment,
    winnerPairId:winner,
    countsAsFirstPlaceDefense,
  });

  await q(client,`
    UPDATE wheel_assignments
    SET status='confirmed',closed_at=CURRENT_TIMESTAMP,close_reason=$2
    WHERE id=$1
  `,[assignment.id,resolutionSource]);
  await q(client,`DELETE FROM wheel_assignment_participants WHERE assignment_id=$1`,[assignment.id]);
  await wheelV3ResolveNoShowOnAssignmentClose(client,assignment.id);
  await applyPendingWheelV3Dissolutions(client,pairIds);
  await applyPendingWheelV3Pauses(client,pairIds);

  const refresh=[];
  for(const categoryId of [...affectedCategories].sort((a,b)=>a-b)){
    refresh.push({categoryId,...await refreshWheelV3Category(client,categoryId)});
  }
  await queueAssignmentNotification(client,assignment,{
    type:'administrative_result',
    title:'Partido resuelto administrativamente',
    body:'El compromiso se cerró con una resolución administrativa y LA RED actualizó la rueda.',
    payload:{assignmentId:assignment.id,failingPairId:failing,winnerPairId:winner,resolutionSource},
    dedupeKey:`v3-admin-result:${assignment.id}`,
  });

  return {
    match,
    failingPairId:failing,
    winnerPairId:winner,
    swapped,
    movements,
    penalty30Days:failingFailure.penalty30Days,
    reportedByUserId,
    refresh,
  };
}


export async function reactivateWheelV3Pair(client,pairId){
  const row=(await q(client,`
    SELECT
      p.id,p.category_id,p.competition_state,
      pws.inactive_since,pws.return_position_base,pws.inactive_reason,pws.auto_reactivate_at,
      CURRENT_TIMESTAMP server_now
    FROM pairs p
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    WHERE p.id=$1
    FOR UPDATE OF p,pws
  `,[pairId])).rows[0];
  if(!row)throw new Error('Pareja inexistente');
  if(row.competition_state!=='paused')throw new Error('La pareja no está inactiva temporalmente');
  if(!row.inactive_since||!row.return_position_base)throw new Error('Falta snapshot de retorno');

  const activeOrder=await wheelV3ActiveOrder(client,row.category_id);
  const fullMonths=fullCalendarMonthsBetween(row.inactive_since,row.server_now);
  const desired=inactivityReturnPosition({
    originalPosition:Number(row.return_position_base),
    fullMonths,
    activeCount:activeOrder.length,
  });
  const shiftedByInsertion=activeOrder.slice(desired-1);
  activeOrder.splice(desired-1,0,Number(pairId));

  await q(client,`
    UPDATE pairs
    SET competition_state='active',position=999997,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[pairId]);
  await wheelV3SetCategoryOrder(client,row.category_id,activeOrder);
  await wheelV3ConsumePositionDebt(client,shiftedByInsertion);
  await q(client,`
    UPDATE pair_wheel_state
    SET
      role=NULL,
      role_streak=0,
      inactive_since=NULL,
      return_position_base=NULL,
      inactive_reason=NULL,
      auto_reactivate_at=NULL,
      real_waiting_since=CURRENT_TIMESTAMP,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId]);

  if(row.inactive_reason==='three_failures'){
    const duo=await wheelV3DuoStateForPair(client,pairId,{lock:true});
    await q(client,`
      UPDATE pair_duo_state
      SET penalty_until=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[duo.id]);
  }

  const leagueId=(await q(client,`SELECT league_id FROM categories WHERE id=$1`,[row.category_id])).rows[0].league_id;
  await queuePairNotification(client,pairId,{
    type:'pair_reactivated',
    title:'Pareja reactivada',
    body:'La pareja volvió a la rueda y ya puede recibir nuevos partidos.',
    payload:{pairId,position:desired},
    dedupeKey:`v3-reactivation:${pairId}:${new Date(row.server_now).toISOString()}`,
  });
  await wheelV3MovementEvent(client,{
    sourceKey:`v3:reactivation:${pairId}:${new Date(row.server_now).toISOString()}`,
    pairId:Number(pairId),
    reason:'inactivity_return',
    toPosition:desired,
  });
  const formation=await completeWheelV3FormationIfReady(client,leagueId);
  const refresh=await refreshWheelV3Category(client,row.category_id);
  return {
    pairId:Number(pairId),
    categoryId:Number(row.category_id),
    position:desired,
    fullMonths,
    formation,
    refresh,
  };
}

export async function reactivateDueWheelV3Penalties(client){
  const due=(await q(client,`
    SELECT p.id
    FROM pairs p
    JOIN pair_wheel_state pws ON pws.pair_id=p.id
    WHERE p.competition_state='paused'
      AND pws.inactive_reason='three_failures'
      AND pws.auto_reactivate_at IS NOT NULL
      AND pws.auto_reactivate_at<=CURRENT_TIMESTAMP
    ORDER BY pws.auto_reactivate_at,p.id
    FOR UPDATE OF p,pws SKIP LOCKED
  `)).rows;
  const reactivated=[];
  for(const row of due)reactivated.push(await reactivateWheelV3Pair(client,row.id));
  return reactivated;
}


async function wheelV3SyncPromotionEdgeAfterAdministrativeMovement(client,categoryId,previousLeaderId){
  const category=await wheelV3CategoryRow(client,categoryId);
  if(Number(category.number)<=1)return null;
  const leader=await wheelV3Leader(client,categoryId);
  if(!leader)return null;
  await q(client,`
    UPDATE pair_wheel_state pws
    SET
      promotion_wins=0,
      awaiting_zone_first_match=CASE WHEN pws.awaiting_zone_kind='promotion' THEN false ELSE pws.awaiting_zone_first_match END,
      awaiting_zone_kind=CASE WHEN pws.awaiting_zone_kind='promotion' THEN NULL ELSE pws.awaiting_zone_kind END,
      updated_at=CURRENT_TIMESTAMP
    FROM pairs p
    WHERE pws.pair_id=p.id
      AND p.category_id=$1
      AND p.id<>$2
      AND (pws.promotion_wins<>0 OR pws.awaiting_zone_kind='promotion')
  `,[categoryId,leader]);
  if(Number(previousLeaderId)!==Number(leader)){
    await q(client,`
      UPDATE pair_wheel_state
      SET promotion_wins=0,awaiting_zone_first_match=false,awaiting_zone_kind=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[leader]);
  }
  return Number(leader);
}

async function wheelV3ApplySimultaneousPositionPenalty(client,categoryId,pairIds,{assignmentId=null}={}){
  const order=await wheelV3ActiveOrder(client,categoryId);
  const beforePosition=Object.fromEntries(order.map((id,index)=>[id,index+1]));
  const debtRows=(await q(client,`
    SELECT id,position_debt
    FROM pairs
    WHERE id=ANY($1::bigint[])
    FOR UPDATE
  `,[order])).rows;
  const debt=Object.fromEntries(debtRows.map(r=>[Number(r.id),Number(r.position_debt||0)]));
  const applied=simultaneousOnePlacePenalty(order,pairIds,debt);
  for(const id of applied.order){
    if(Number(applied.debt[id]||0)!==Number(debt[id]||0)){
      await q(client,`UPDATE pairs SET position_debt=$2 WHERE id=$1`,[id,Number(applied.debt[id]||0)]);
    }
  }
  await wheelV3SetCategoryOrder(client,categoryId,applied.order);
  for(const pairId of pairIds.map(Number)){
    const to=applied.order.indexOf(pairId)+1;
    const from=beforePosition[pairId];
    if(to>0&&from!==to){
      await wheelV3MovementEvent(client,{
        sourceKey:`v3:assignment:${assignmentId??'none'}:simultaneous-penalty:${pairId}`,
        pairId,
        assignmentId,
        reason:'simultaneous_failure_penalty',
        fromPosition:from,
        toPosition:to,
      });
    }
  }
  return applied;
}

export async function applyWheelV3BothFailure(client,{
  assignmentId,
  resolutionSource='both_failure',
}){
  const assignment=(await q(client,`
    SELECT * FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment)throw new Error('Assignment inexistente');
  if(!['open','result_pending','disputed'].includes(assignment.status))throw new Error('Assignment no disponible');

  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const category=await wheelV3CategoryRow(client,assignment.category_id);
  await q(client,`
    SELECT id FROM categories
    WHERE league_id=$1
    ORDER BY number
    FOR UPDATE
  `,[category.league_id]);

  const previousLeader=await wheelV3Leader(client,assignment.category_id);
  const applied=await wheelV3ApplySimultaneousPositionPenalty(client,assignment.category_id,pairIds,{assignmentId:assignment.id});
  const activeCount=await wheelV3ActiveCount(client,assignment.category_id);

  const failureResults=[];
  const relegationDecisions=[];
  for(const pairId of pairIds){
    const beforeState=(await q(client,`
      SELECT role FROM pair_wheel_state WHERE pair_id=$1 FOR UPDATE
    `,[pairId])).rows[0];
    const pair=await wheelV3CurrentPairRow(client,pairId);
    const role=roleAfterOwnFailure({
      previousRole:beforeState?.role,
      position:Number(pair.position),
      activeCount,
    });
    await q(client,`
      UPDATE pair_wheel_state
      SET
        role=$2::varchar,
        role_streak=CASE WHEN role=$2::varchar THEN role_streak+1 ELSE 1 END,
        defense_required_until_real=$3,
        updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[pairId,role.role,role.defenseRequiredUntilReal]);
    failureResults.push({pairId,...await wheelV3ApplyFailureStreak(client,pairId,{ownFailure:true})});
    relegationDecisions.push({pairId,state:await wheelV3AdministrativeRelegationDecision(client,pairId,{ownFailure:true})});
  }

  await wheelV3SyncPromotionEdgeAfterAdministrativeMovement(client,assignment.category_id,previousLeader);
  if(Number(category.number)===1){
    await wheelV3SyncFirstPlaceReign(client,assignment.league_id,assignment.category_id);
  }

  const movements=[];
  const affectedCategories=new Set([Number(assignment.category_id)]);
  for(const decision of relegationDecisions){
    if(!decision.state.descend||Number(category.number)>=7)continue;
    const target=(await q(client,`
      SELECT id FROM categories
      WHERE league_id=$1 AND number=$2
    `,[category.league_id,Number(category.number)+1])).rows[0];
    const moved=await wheelV3MovePairCategory(client,decision.pairId,target.id,{mode:'relegation',assignmentId:assignment.id,sourceKey:`v3:assignment:${assignment.id}:both-failure-relegation:${decision.pairId}`});
    movements.push({...moved,type:'relegation'});
    affectedCategories.add(Number(target.id));
  }

  for(const result of failureResults){
    if(result.penalty30Days){
      await wheelV3ApplyThirtyDayPenalty(client,result.pairId,result.duoId);
    }
  }

  await q(client,`
    UPDATE wheel_assignments
    SET status='confirmed',closed_at=CURRENT_TIMESTAMP,close_reason=$2
    WHERE id=$1
  `,[assignment.id,resolutionSource]);
  await q(client,`DELETE FROM wheel_assignment_participants WHERE assignment_id=$1`,[assignment.id]);
  await wheelV3ResolveNoShowOnAssignmentClose(client,assignment.id);
  await applyPendingWheelV3Dissolutions(client,pairIds);
  await applyPendingWheelV3Pauses(client,pairIds);

  const refresh=[];
  for(const categoryId of [...affectedCategories].sort((a,b)=>a-b)){
    refresh.push({categoryId,...await refreshWheelV3Category(client,categoryId)});
  }
  await queueAssignmentNotification(client,assignment,{
    type:'both_failure',
    title:'Compromiso vencido',
    body:'El compromiso se cerró por incumplimiento de ambas parejas y se aplicaron las consecuencias correspondientes.',
    payload:{assignmentId:assignment.id,resolutionSource},
    dedupeKey:`v3-both-failure:${assignment.id}`,
  });

  return {
    pairIds,
    order:applied.order,
    debt:applied.debt,
    movements,
    penalties30Days:failureResults.filter(x=>x.penalty30Days).map(x=>x.pairId),
    refresh,
  };
}


async function wheelV3PausePairNow(client,pairId,{reason='voluntary'}={}){
  const pair=await wheelV3CurrentPairRow(client,pairId);
  if(pair.competition_state!=='active')return {paused:false,alreadyInactive:true,pairId:Number(pairId)};
  const occupied=(await q(client,`
    SELECT assignment_id
    FROM wheel_assignment_participants
    WHERE pair_id=$1
  `,[pairId])).rows[0];
  if(occupied)throw new Error('La pareja tiene un compromiso pendiente');

  const previousLeader=await wheelV3Leader(client,pair.category_id);
  const returnPosition=Number(pair.position);

  await q(client,`
    UPDATE pairs
    SET competition_state='paused',pause_after_current=false,updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[pairId]);
  const inactiveState=(await q(client,`
    UPDATE pair_wheel_state
    SET
      inactive_since=CURRENT_TIMESTAMP,
      return_position_base=$2,
      inactive_reason=$3,
      auto_reactivate_at=NULL,
      promotion_wins=0,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
    RETURNING inactive_since
  `,[pairId,returnPosition,reason])).rows[0];

  const activeOrder=await wheelV3ActiveOrder(client,pair.category_id);
  await wheelV3SetCategoryOrder(client,pair.category_id,activeOrder);
  await wheelV3SyncPromotionEdgeAfterAdministrativeMovement(client,pair.category_id,previousLeader);
  await queuePairNotification(client,pairId,{
    type:'pair_inactive',
    title:'Pareja inactiva',
    body:'La pareja quedó fuera de la rueda. Su posición de retorno queda guardada según las reglas de inactividad.',
    payload:{pairId,reason,returnPosition},
    dedupeKey:`v3-pause:${pairId}:${new Date(inactiveState.inactive_since).toISOString()}`,
  });
  if(Number(pair.category_number)===1){
    const nextLeader=await wheelV3Leader(client,pair.category_id);
    if(nextLeader)await wheelV3OpenReign(client,pair.league_id,nextLeader);
    else{
      await q(client,`
        UPDATE first_place_reigns
        SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
        WHERE league_id=$1 AND ended_at IS NULL
      `,[pair.league_id]);
    }
  }
  return {
    paused:true,
    pairId:Number(pairId),
    categoryId:Number(pair.category_id),
    returnPosition,
  };
}

export async function requestWheelV3Inactivity(client,{pairId,requestedByUserId}){
  const member=(await q(client,`
    SELECT 1 FROM pair_members
    WHERE pair_id=$1 AND user_id=$2
  `,[pairId,requestedByUserId])).rowCount;
  if(!member)throw new Error('El usuario no integra la pareja');

  const pair=await wheelV3CurrentPairRow(client,pairId);
  if(pair.competition_state!=='active')return {status:'already_inactive',pairId:Number(pairId)};

  const assignment=(await q(client,`
    SELECT assignment_id
    FROM wheel_assignment_participants
    WHERE pair_id=$1
  `,[pairId])).rows[0];
  if(assignment){
    await q(client,`
      UPDATE pairs
      SET pause_after_current=true,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[pairId]);
    await q(client,`
      INSERT INTO pair_pause_requests(pair_id,requested_by_user_id,status,effective_after_current)
      VALUES($1,$2,'pending',true)
      ON CONFLICT(pair_id) WHERE status='pending'
      DO UPDATE SET requested_by_user_id=EXCLUDED.requested_by_user_id,effective_after_current=true
    `,[pairId,requestedByUserId]);
    return {status:'after_current',pairId:Number(pairId),assignmentId:Number(assignment.assignment_id)};
  }

  await q(client,`
    INSERT INTO pair_pause_requests(pair_id,requested_by_user_id,status,effective_after_current,resolved_at)
    VALUES($1,$2,'applied',false,CURRENT_TIMESTAMP)
    ON CONFLICT(pair_id) WHERE status='pending'
    DO UPDATE SET status='applied',resolved_at=CURRENT_TIMESTAMP,effective_after_current=false
  `,[pairId,requestedByUserId]);
  const paused=await wheelV3PausePairNow(client,pairId,{reason:'voluntary'});
  const refresh=await refreshWheelV3Category(client,pair.category_id);
  return {status:'paused',...paused,refresh};
}

async function applyPendingWheelV3Dissolutions(client,pairIds){
  const archived=[];
  for(const pairId of pairIds.map(Number)){
    const request=(await q(client,`
      SELECT *
      FROM pair_dissolution_requests
      WHERE pair_id=$1
        AND status IN('confirmed','awaiting_result')
      ORDER BY id DESC
      LIMIT 1
      FOR UPDATE
    `,[pairId])).rows[0];
    if(!request)continue;
    const occupied=(await q(client,`
      SELECT 1 FROM wheel_assignment_participants WHERE pair_id=$1
    `,[pairId])).rowCount;
    if(occupied)continue;
    await q(client,`
      UPDATE pair_dissolution_requests
      SET status='applied',resolved_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[request.id]);
    archived.push(await archiveWheelV3Pair(client,pairId));
  }
  return archived;
}

async function applyPendingWheelV3Pauses(client,pairIds){
  const paused=[];
  for(const pairId of pairIds.map(Number)){
    const pair=(await q(client,`
      SELECT competition_state,pause_after_current
      FROM pairs WHERE id=$1 FOR UPDATE
    `,[pairId])).rows[0];
    if(!pair||pair.competition_state!=='active'||!pair.pause_after_current)continue;
    await q(client,`
      UPDATE pair_pause_requests
      SET status='applied',resolved_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1 AND status='pending'
    `,[pairId]);
    paused.push(await wheelV3PausePairNow(client,pairId,{reason:'voluntary'}));
  }
  return paused;
}


async function wheelV3ResolveNoShowOnAssignmentClose(client,assignmentId){
  await q(client,`
    UPDATE wheel_no_shows
    SET
      status=CASE WHEN status='accepted' THEN 'accepted' ELSE 'resolved' END,
      responded_at=COALESCE(responded_at,CURRENT_TIMESTAMP)
    WHERE assignment_id=$1
      AND status IN('pending','accepted','contested','admin_review')
  `,[assignmentId]);
}

export async function reportWheelV3NoShow(client,{assignmentId,reportedByPairId}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment)throw new Error('Assignment inexistente');
  if(assignment.status!=='open'||assignment.first_result_at)throw new Error('Assignment no disponible para no-show');
  if(!assignment.scheduled_at)throw new Error('El assignment no tiene fecha/hora oficial');
  const now=(await q(client,`SELECT clock_timestamp() now`)).rows[0].now;
  if(new Date(now)<new Date(assignment.scheduled_at))throw new Error('El no-show solo puede reportarse después del horario oficial');

  const reporter=Number(reportedByPairId);
  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  if(!pairIds.includes(reporter))throw new Error('Pareja reportante inválida');
  const reported=pairIds.find(id=>id!==reporter);

  const existing=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('pending','contested','admin_review','accepted')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(existing)return existing;

  const created=(await q(client,`
    INSERT INTO wheel_no_shows(
      assignment_id,reported_by_pair_id,reported_pair_id,
      status,response_deadline_at
    )
    VALUES($1,$2,$3,'pending',CURRENT_TIMESTAMP+interval '48 hours')
    RETURNING *
  `,[assignmentId,reporter,reported])).rows[0];
  await queueAssignmentNotification(client,assignment,{
    type:'no_show_reported',
    title:'No-show reportado',
    body:'Se informó un no-show. El reporte puede resolverse o pasar a Administración según la respuesta.',
    payload:{assignmentId,noShowId:created.id,responseDeadlineAt:created.response_deadline_at},
    dedupeKey:`v3-no-show:${created.id}`,
  });
  return created;
}

export async function cancelWheelV3NoShow(client,{assignmentId,reportedByPairId}){
  const row=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('pending','contested','admin_review','accepted')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!row)throw new Error('No existe reporte de no-show');
  if(Number(row.reported_by_pair_id)!==Number(reportedByPairId))throw new Error('Solo quien reportó puede cancelar');
  if(row.status!=='pending')throw new Error('El reporte ya no puede cancelarse');
  const allowed=(await q(client,`SELECT CURRENT_TIMESTAMP<=$1::timestamptz ok`,[row.response_deadline_at])).rows[0].ok;
  if(!allowed)throw new Error('Venció la ventana de 48 horas');
  return (await q(client,`
    UPDATE wheel_no_shows
    SET status='resolved',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *
  `,[row.id])).rows[0];
}

export async function contestWheelV3NoShow(client,{assignmentId,reportedPairId}){
  const row=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('pending','contested','admin_review','accepted')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!row)throw new Error('No existe reporte de no-show');
  if(Number(row.reported_pair_id)!==Number(reportedPairId))throw new Error('Pareja reportada inválida');
  if(row.status!=='pending')throw new Error('El reporte ya fue resuelto');
  const updated=(await q(client,`
    UPDATE wheel_no_shows
    SET status='contested',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *
  `,[row.id])).rows[0];
  await q(client,`
    UPDATE wheel_assignments
    SET status='disputed'
    WHERE id=$1 AND status IN('open','result_pending')
  `,[assignmentId]);
  const assignment=(await q(client,`SELECT * FROM wheel_assignments WHERE id=$1`,[assignmentId])).rows[0];
  await queueAssignmentNotification(client,assignment,{
    type:'no_show_disputed',
    title:'No-show en revisión',
    body:'El reporte de no-show fue objetado y quedó bloqueado para revisión administrativa.',
    payload:{assignmentId,noShowId:updated.id},
    dedupeKey:`v3-no-show-disputed:${updated.id}`,
  });
  return updated;
}

export async function acceptWheelV3NoShow(client,{assignmentId,reportedPairId,reportedByUserId=null}){
  const row=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('pending','contested','admin_review','accepted')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!row)throw new Error('No existe reporte de no-show');
  if(Number(row.reported_pair_id)!==Number(reportedPairId))throw new Error('Pareja reportada inválida');
  if(row.status!=='pending')throw new Error('El reporte ya fue resuelto');

  await q(client,`
    UPDATE wheel_no_shows
    SET status='accepted',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[row.id]);

  return applyWheelV3OneSidedFailure(client,{
    assignmentId,
    failingPairId:reportedPairId,
    reportedByUserId,
    resolutionSource:'no_show_accepted',
    countsAsFirstPlaceDefense:true,
  });
}

export async function escalateExpiredWheelV3NoShows(client){
  const rows=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE status='pending'
      AND response_deadline_at<=CURRENT_TIMESTAMP
    ORDER BY response_deadline_at,id
    FOR UPDATE SKIP LOCKED
  `)).rows;
  const escalated=[];
  for(const row of rows){
    const updated=(await q(client,`
      UPDATE wheel_no_shows
      SET status='admin_review',responded_at=CURRENT_TIMESTAMP
      WHERE id=$1
      RETURNING *
    `,[row.id])).rows[0];
    await q(client,`
      UPDATE wheel_assignments
      SET status='disputed'
      WHERE id=$1 AND status IN('open','result_pending')
    `,[row.assignment_id]);
    const assignment=(await q(client,`SELECT * FROM wheel_assignments WHERE id=$1`,[row.assignment_id])).rows[0];
    await queueAssignmentNotification(client,assignment,{
      type:'no_show_admin_review',
      title:'No-show enviado a Administración',
      body:'La ventana de 48 horas terminó sin reconocimiento. Administración debe resolver el caso.',
      payload:{assignmentId:row.assignment_id,noShowId:row.id},
      dedupeKey:`v3-no-show-admin:${row.id}`,
    });
    escalated.push(updated);
  }
  return escalated;
}


function wheelV3ResultPayload(row){
  return {
    winner_pair_id:Number(row.winner_pair_id),
    result_type:row.result_type,
    played_at:row.played_at,
    score:row.score,
    abandoned_pair_id:row.abandoned_pair_id,
  };
}

async function wheelV3ValidateFirstResultWindow(client,assignment,playedAt){
  const now=(await q(client,`SELECT clock_timestamp() now`)).rows[0].now;
  const played=new Date(playedAt);
  if(Number.isNaN(played.getTime()))throw new Error('Fecha de partido inválida');
  if(played>new Date(now))throw new Error('La fecha jugada no puede estar en el futuro');
  if(played<new Date(assignment.assigned_at))throw new Error('El partido no puede ser anterior al assignment');
  if(played>new Date(assignment.deadline_at))throw new Error('El partido fue jugado fuera del plazo de 30 días');
  if(!assignment.first_result_at&&new Date(now)>new Date(assignment.deadline_at))throw new Error('Venció el plazo de 30 días para cargar el primer resultado');
  if(assignment.first_result_at&&assignment.confirmation_deadline_at&&new Date(now)>new Date(assignment.confirmation_deadline_at)){
    throw new Error('Venció la ventana de revisión del resultado');
  }
  if(assignment.cancelled_at){
    const eligibility=resultAllowedAfterCancellation({playedAt,cancelledAt:assignment.cancelled_at});
    if(!eligibility)throw new Error('El partido fue jugado después de la cancelación');
  }
}

export async function submitWheelV3ResultVersion(client,{
  assignmentId,
  pairId,
  winnerPairId,
  resultType,
  playedAt,
  score=null,
  abandonedPairId=null,
}){
  if(!resultCountsAsReal(resultType))throw new Error('Solo se cargan resultados de partidos reales');
  const assignment=(await q(client,`
    SELECT * FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment)throw new Error('Assignment inexistente');
  if(!['open','result_pending','cancelled'].includes(assignment.status))throw new Error('Assignment no admite carga de resultado');

  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const submitter=Number(pairId),winner=Number(winnerPairId);
  if(!pairIds.includes(submitter))throw new Error('Pareja cargadora inválida');
  if(!pairIds.includes(winner))throw new Error('Ganador inválido');
  await wheelV3ValidateFirstResultWindow(client,assignment,playedAt);

  let normalizedScore=score;
  if(resultType==='normal'){
    normalizedScore=normalizeScore(score);
    const aSets=normalizedScore.sets.filter(s=>s.pairA>s.pairB).length;
    const bSets=normalizedScore.sets.length-aSets;
    const scoreWinner=aSets>bSets?Number(assignment.pair_a_id):Number(assignment.pair_b_id);
    if(scoreWinner!==winner)throw new Error('El ganador no coincide con el marcador');
    if(abandonedPairId!=null)throw new Error('Un resultado normal no lleva abandono');
  }else if(resultType==='injury_abandonment'){
    const abandoned=Number(abandonedPairId);
    if(!pairIds.includes(abandoned)||abandoned===winner)throw new Error('Abandono inválido');
  }

  const version=(await q(client,`
    INSERT INTO wheel_result_versions(
      assignment_id,pair_id,winner_pair_id,result_type,played_at,score,abandoned_pair_id,version_no
    )
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,1)
    ON CONFLICT(assignment_id,pair_id)
    DO UPDATE SET
      winner_pair_id=EXCLUDED.winner_pair_id,
      result_type=EXCLUDED.result_type,
      played_at=EXCLUDED.played_at,
      score=EXCLUDED.score,
      abandoned_pair_id=EXCLUDED.abandoned_pair_id,
      version_no=wheel_result_versions.version_no+1,
      updated_at=CURRENT_TIMESTAMP
    RETURNING *
  `,[
    assignmentId,
    submitter,
    winner,
    resultType,
    playedAt,
    JSON.stringify(normalizedScore??null),
    abandonedPairId,
  ])).rows[0];

  const wasFirstLoad=!assignment.first_result_at;
  const marked=await registerWheelV3FirstResult(client,assignmentId);
  if(wasFirstLoad){
    await queueAssignmentNotification(client,marked,{
      type:'result_loaded',
      title:'Resultado cargado',
      body:'Se cargó un resultado. Hay 7 días para confirmarlo o discutirlo.',
      payload:{assignmentId,confirmationDeadlineAt:marked.confirmation_deadline_at},
      dedupeKey:`v3-result-loaded:${assignmentId}`,
    });
  }
  const versions=(await q(client,`
    SELECT *
    FROM wheel_result_versions
    WHERE assignment_id=$1
    ORDER BY pair_id
    FOR UPDATE
  `,[assignmentId])).rows;

  if(versions.length>=2){
    const first=versions[0],second=versions[1];
    if(resultEquals(wheelV3ResultPayload(first),wheelV3ResultPayload(second))){
      const applied=await applyWheelV3ConfirmedRealResult(client,{
        assignmentId,
        winnerPairId:first.winner_pair_id,
        resultType:first.result_type,
        score:first.score,
        abandonedPairId:first.abandoned_pair_id,
        playedAt:first.played_at,
        resolutionSource:'pair_agreement',
      });
      return {status:'confirmed',version,assignment:marked,applied};
    }
    await q(client,`UPDATE wheel_assignments SET status='disputed' WHERE id=$1`,[assignmentId]);
    await queueAssignmentNotification(client,marked,{
      type:'result_disputed',
      title:'Resultado en disputa',
      body:'Las versiones cargadas no coinciden. Administración debe resolver el resultado.',
      payload:{assignmentId},
      dedupeKey:`v3-result-disputed:${assignmentId}`,
    });
    return {status:'disputed',version,assignment:marked};
  }

  return {status:'result_pending',version,assignment:marked};
}

export async function confirmWheelV3Result(client,{assignmentId,confirmingPairId}){
  const assignment=(await q(client,`
    SELECT * FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||assignment.status!=='result_pending')throw new Error('No hay resultado pendiente de confirmación');
  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const confirming=Number(confirmingPairId);
  if(!pairIds.includes(confirming))throw new Error('Pareja confirmante inválida');

  const version=(await q(client,`
    SELECT *
    FROM wheel_result_versions
    WHERE assignment_id=$1
      AND pair_id<>$2
    ORDER BY updated_at DESC,id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId,confirming])).rows[0];
  if(!version)throw new Error('No existe resultado rival para confirmar');

  return applyWheelV3ConfirmedRealResult(client,{
    assignmentId,
    winnerPairId:version.winner_pair_id,
    resultType:version.result_type,
    score:version.score,
    abandonedPairId:version.abandoned_pair_id,
    playedAt:version.played_at,
    resolutionSource:'explicit_confirmation',
  });
}

export async function autoValidateDueWheelV3Results(client){
  const assignments=(await q(client,`
    SELECT id
    FROM wheel_assignments
    WHERE status='result_pending'
      AND first_result_at IS NOT NULL
      AND confirmation_deadline_at<=CURRENT_TIMESTAMP
    ORDER BY confirmation_deadline_at,id
    FOR UPDATE SKIP LOCKED
  `)).rows;
  const applied=[];
  for(const item of assignments){
    const versions=(await q(client,`
      SELECT *
      FROM wheel_result_versions
      WHERE assignment_id=$1
      ORDER BY updated_at DESC,id DESC
      FOR UPDATE
    `,[item.id])).rows;
    if(!versions.length)continue;
    if(versions.length>=2&&!resultEquals(wheelV3ResultPayload(versions[0]),wheelV3ResultPayload(versions[1]))){
      await q(client,`UPDATE wheel_assignments SET status='disputed' WHERE id=$1`,[item.id]);
      continue;
    }
    const version=versions[0];
    applied.push(await applyWheelV3ConfirmedRealResult(client,{
      assignmentId:item.id,
      winnerPairId:version.winner_pair_id,
      resultType:version.result_type,
      score:version.score,
      abandonedPairId:version.abandoned_pair_id,
      playedAt:version.played_at,
      resolutionSource:'silence_auto_validation',
    }));
  }
  return applied;
}

export async function expireDueWheelV3Assignments(client){
  const rows=(await q(client,`
    SELECT id
    FROM wheel_assignments
    WHERE status='open'
      AND first_result_at IS NULL
      AND deadline_at<=CURRENT_TIMESTAMP
      AND NOT EXISTS(
        SELECT 1
        FROM wheel_no_shows ns
        WHERE ns.assignment_id=wheel_assignments.id
          AND ns.status IN('pending','contested','admin_review')
      )
    ORDER BY deadline_at,id
    FOR UPDATE SKIP LOCKED
  `)).rows;
  const expired=[];
  for(const row of rows){
    expired.push(await applyWheelV3BothFailure(client,{
      assignmentId:row.id,
      resolutionSource:'deadline_both_failure',
    }));
  }
  return expired;
}


export async function expireWheelV3ScheduleProposals(client){
  return (await q(client,`
    UPDATE wheel_schedule_proposals
    SET status='expired',responded_at=CURRENT_TIMESTAMP
    WHERE status='pending'
      AND response_deadline_at<=CURRENT_TIMESTAMP
    RETURNING *
  `)).rows;
}

export async function runWheelV3Maintenance(client){
  const settings=(await q(client,`
    SELECT key,value FROM app_settings
    WHERE key IN('league_clock_paused')
  `)).rows;
  const settingMap=Object.fromEntries(settings.map(r=>[r.key,r.value]));
  if(settingMap.league_clock_paused===true){
    return {
      paused:true,
      formation:[],
      scheduleExpired:0,
      reactivated:0,
      noShowsEscalated:0,
      resultsAutoValidated:0,
      assignmentsExpired:0,
      refresh:[],
    };
  }

  const leagues=(await q(client,`
    SELECT id
    FROM leagues
    WHERE active=true
    ORDER BY id
    FOR UPDATE
  `)).rows;

  const scheduleExpired=await expireWheelV3ScheduleProposals(client);
  const reactivated=await reactivateDueWheelV3Penalties(client);

  const formation=[];
  for(const league of leagues){
    formation.push({leagueId:Number(league.id),...await completeWheelV3FormationIfReady(client,league.id)});
  }

  const noShowsEscalated=await escalateExpiredWheelV3NoShows(client);
  const resultsAutoValidated=await autoValidateDueWheelV3Results(client);
  const assignmentsExpired=await expireDueWheelV3Assignments(client);

  const categories=(await q(client,`
    SELECT id
    FROM categories
    ORDER BY league_id,number
  `)).rows;
  const refresh=[];
  for(const category of categories){
    refresh.push({categoryId:Number(category.id),...await refreshWheelV3Category(client,category.id)});
  }

  return {
    formation,
    scheduleExpired:scheduleExpired.length,
    reactivated:reactivated.length,
    noShowsEscalated:noShowsEscalated.length,
    resultsAutoValidated:resultsAutoValidated.length,
    assignmentsExpired:assignmentsExpired.length,
    refresh,
  };
}


async function wheelV3CanonicalDuoState(client,leagueId,userIds,{lock=false}={}){
  const ids=[...userIds].map(Number).sort((a,b)=>a-b);
  if(ids.length!==2||ids[0]===ids[1])throw new Error('Dupla inválida');
  return (await q(client,`
    SELECT *
    FROM pair_duo_state
    WHERE league_id=$1
      AND member_low_id=$2
      AND member_high_id=$3
    ${lock?'FOR UPDATE':''}
  `,[leagueId,ids[0],ids[1]])).rows[0]||null;
}

export async function resolveWheelV3FormationCategory(client,{userIds,requestedCategoryNumber=null}){
  const ids=[...userIds].map(Number).sort((a,b)=>a-b);
  if(ids.length!==2||ids[0]===ids[1])throw new Error('Dupla inválida');
  const users=(await q(client,`
    SELECT id,gender,current_category_number
    FROM users
    WHERE id=ANY($1::bigint[])
    ORDER BY id
    FOR UPDATE
  `,[ids])).rows;
  if(users.length!==2)throw new Error('Jugadores inexistentes');
  if(users[0].gender!==users[1].gender)throw new Error('La pareja debe pertenecer al mismo circuito');

  const league=(await q(client,`
    SELECT * FROM leagues
    WHERE gender=$1 AND active=true
    FOR UPDATE
  `,[users[0].gender])).rows[0];
  if(!league)throw new Error('Circuito inexistente');

  const duo=await wheelV3CanonicalDuoState(client,league.id,ids,{lock:true});
  const known=users.map(u=>u.current_category_number==null?null:Number(u.current_category_number)).filter(Number.isInteger);
  let normalCategory;
  if(known.length)normalCategory=Math.min(...known);
  else{
    normalCategory=Number(requestedCategoryNumber);
    if(!Number.isInteger(normalCategory)||normalCategory<1||normalCategory>7)throw new Error('Elegí una categoría inicial');
  }
  const categoryNumber=categoryForReformedPair({
    memberCategories:known.length?known:[normalCategory,normalCategory],
    pendingDescentCategory:duo?.pending_relegation_category_id
      ?Number((await q(client,`SELECT number FROM categories WHERE id=$1`,[duo.pending_relegation_category_id])).rows[0].number)
      :null,
  });
  const category=(await q(client,`
    SELECT * FROM categories
    WHERE league_id=$1 AND number=$2
    FOR UPDATE
  `,[league.id,categoryNumber])).rows[0];
  return {users,league,duo,category,categoryNumber};
}

export async function formWheelV3Pair(client,{userIds,requestedCategoryNumber=null}){
  const ids=[...userIds].map(Number).sort((a,b)=>a-b);
  const resolved=await resolveWheelV3FormationCategory(client,{userIds:ids,requestedCategoryNumber});
  const occupied=(await q(client,`
    SELECT user_id FROM active_pair_memberships
    WHERE user_id=ANY($1::bigint[])
    FOR UPDATE
  `,[ids])).rows;
  if(occupied.length)throw new Error('Uno de los jugadores ya integra una pareja vigente');

  let pair=(await q(client,`
    SELECT p.*
    FROM pairs p
    WHERE p.competition_state='inactive'
      AND p.league_id=$1
      AND (
        SELECT array_agg(pm.user_id ORDER BY pm.user_id)
        FROM pair_members pm
        WHERE pm.pair_id=p.id
      )=$2::bigint[]
    ORDER BY p.id DESC
    LIMIT 1
    FOR UPDATE
  `,[resolved.league.id,ids])).rows[0];

  const activeOrder=await wheelV3ActiveOrder(client,resolved.category.id);
  const entryPosition=entryPositionPenultimate(activeOrder.length);
  const penaltyUntil=resolved.duo?.penalty_until?new Date(resolved.duo.penalty_until):null;
  const serverNow=(await q(client,`SELECT CURRENT_TIMESTAMP now`)).rows[0].now;
  const underPenalty=Boolean(penaltyUntil&&penaltyUntil>new Date(serverNow));
  if(resolved.duo?.penalty_until&&!underPenalty){
    await q(client,`
      UPDATE pair_duo_state
      SET penalty_until=NULL,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[resolved.duo.id]);
  }

  if(pair){
    await q(client,`
      UPDATE pairs
      SET
        category_id=$2,
        position=999996,
        competition_state=$3,
        archived_at=NULL,
        pause_after_current=false,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[pair.id,resolved.category.id,underPenalty?'paused':'active']);
    await q(client,`
      UPDATE pair_wheel_state
      SET
        role=NULL,
        role_streak=0,
        defense_required_until_real=false,
        promotion_wins=0,
        awaiting_zone_first_match=false,
        awaiting_zone_kind=NULL,
        inactive_since=CASE WHEN $2 THEN $3::timestamptz-interval '30 days' ELSE NULL END,
        return_position_base=CASE WHEN $2 THEN $4::int ELSE NULL END,
        inactive_reason=CASE WHEN $2 THEN 'three_failures' ELSE NULL END,
        auto_reactivate_at=CASE WHEN $2 THEN $3::timestamptz ELSE NULL END,
        real_waiting_since=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[pair.id,underPenalty,penaltyUntil,entryPosition]);
  }else{
    pair=(await q(client,`
      INSERT INTO pairs(league_id,category_id,position,competition_state)
      VALUES($1,$2,999996,$3)
      RETURNING *
    `,[resolved.league.id,resolved.category.id,underPenalty?'paused':'active'])).rows[0];
    for(const userId of ids){
      await q(client,`INSERT INTO pair_members(pair_id,user_id) VALUES($1,$2)`,[pair.id,userId]);
    }
    await q(client,`
      UPDATE pair_wheel_state
      SET
        inactive_since=CASE WHEN $2 THEN $3::timestamptz-interval '30 days' ELSE NULL END,
        return_position_base=CASE WHEN $2 THEN $4::int ELSE NULL END,
        inactive_reason=CASE WHEN $2 THEN 'three_failures' ELSE NULL END,
        auto_reactivate_at=CASE WHEN $2 THEN $3::timestamptz ELSE NULL END,
        real_waiting_since=CURRENT_TIMESTAMP,
        updated_at=CURRENT_TIMESTAMP
      WHERE pair_id=$1
    `,[pair.id,underPenalty,penaltyUntil,entryPosition]);
  }

  for(const userId of ids){
    await q(client,`
      INSERT INTO active_pair_memberships(user_id,pair_id)
      VALUES($1,$2)
    `,[userId,pair.id]);
    await q(client,`
      UPDATE users
      SET current_category_number=COALESCE(current_category_number,$2),updated_at=CURRENT_TIMESTAMP
      WHERE id=$1
    `,[userId,resolved.categoryNumber]);
  }

  if(underPenalty){
    const currentActive=await wheelV3ActiveOrder(client,resolved.category.id,{excludePairId:pair.id});
    await wheelV3SetCategoryOrder(client,resolved.category.id,currentActive);
  }else{
    const shiftedByInsertion=activeOrder.slice(entryPosition-1);
    activeOrder.splice(entryPosition-1,0,Number(pair.id));
    await wheelV3SetCategoryOrder(client,resolved.category.id,activeOrder);
    await wheelV3ConsumePositionDebt(client,shiftedByInsertion);
  }

  if(Number(resolved.duo?.failure_streak||0)>0){
    const streak=Number(resolved.duo.failure_streak);
    await queuePairNotification(client,pair.id,{
      type:'failure_streak_warning',
      title:'Incumplimientos pendientes',
      body:`Esta dupla conserva ${streak} incumplimiento${streak===1?'':'s'} consecutivo${streak===1?'':'s'}. ${streak>=2?'Un incumplimiento más aplicará 30 días sin asignaciones.':''}`.trim(),
      payload:{pairId:pair.id,failureStreak:streak},
      dedupeKey:`v3-reform-failure-warning:${pair.id}:${streak}:${new Date(serverNow).toISOString()}`,
    });
  }
  if(resolved.duo?.pending_relegation_category_id){
    await queuePairNotification(client,pair.id,{
      type:'relegation_resumed',
      title:'Período de descenso retomado',
      body:'La dupla volvió a formarse y retoma el período de descenso pendiente en la categoría donde se había abierto.',
      payload:{pairId:pair.id,categoryNumber:resolved.categoryNumber,losses:Number(resolved.duo.pending_relegation_losses||0)},
      dedupeKey:`v3-reform-relegation:${pair.id}:${resolved.duo.id}:${new Date(serverNow).toISOString()}`,
    });
  }
  const formation=underPenalty
    ?null
    :await completeWheelV3FormationIfReady(client,resolved.league.id);
  const refresh=await refreshWheelV3Category(client,resolved.category.id);
  return {
    pairId:Number(pair.id),
    categoryId:Number(resolved.category.id),
    categoryNumber:Number(resolved.categoryNumber),
    entryPosition,
    pendingRelegation:Boolean(resolved.duo?.pending_relegation_category_id),
    underPenalty,
    penaltyUntil:underPenalty?penaltyUntil:null,
    formation,
    refresh,
  };
}

export async function archiveWheelV3Pair(client,pairId){
  const pair=await wheelV3CurrentPairRow(client,pairId);
  const occupied=(await q(client,`
    SELECT assignment_id
    FROM wheel_assignment_participants
    WHERE pair_id=$1
  `,[pairId])).rows[0];
  if(occupied)throw new Error('La pareja debe resolver su compromiso antes de disolverse');

  const previousLeader=await wheelV3Leader(client,pair.category_id);
  const dissolvedAt=(await q(client,`SELECT CURRENT_TIMESTAMP now`)).rows[0].now;
  await queuePairNotification(client,pairId,{
    type:'pair_dissolved',
    title:'Pareja disuelta',
    body:'La pareja fue disuelta. Las obligaciones de la dupla exacta que deban sobrevivir quedan conservadas.',
    payload:{pairId},
    dedupeKey:`v3-dissolve:${pairId}:${new Date(dissolvedAt).toISOString()}`,
  });
  await q(client,`DELETE FROM active_pair_memberships WHERE pair_id=$1`,[pairId]);
  await q(client,`
    UPDATE pairs
    SET
      competition_state='inactive',
      archived_at=CURRENT_TIMESTAMP,
      pause_after_current=false,
      updated_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[pairId]);
  await q(client,`
    UPDATE pair_wheel_state
    SET
      role=NULL,
      role_streak=0,
      defense_required_until_real=false,
      promotion_wins=0,
      awaiting_zone_first_match=false,
      awaiting_zone_kind=NULL,
      inactive_since=NULL,
      return_position_base=NULL,
      inactive_reason=NULL,
      auto_reactivate_at=NULL,
      updated_at=CURRENT_TIMESTAMP
    WHERE pair_id=$1
  `,[pairId]);

  const activeOrder=await wheelV3ActiveOrder(client,pair.category_id);
  await wheelV3SetCategoryOrder(client,pair.category_id,activeOrder);
  await wheelV3SyncPromotionEdgeAfterAdministrativeMovement(client,pair.category_id,previousLeader);
  if(Number(pair.category_number)===1){
    const leader=await wheelV3Leader(client,pair.category_id);
    if(leader)await wheelV3OpenReign(client,pair.league_id,leader);
    else await q(client,`
      UPDATE first_place_reigns
      SET ended_at=COALESCE(ended_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
      WHERE league_id=$1 AND ended_at IS NULL
    `,[pair.league_id]);
  }
  const refresh=await refreshWheelV3Category(client,pair.category_id);
  return {pairId:Number(pairId),categoryId:Number(pair.category_id),refresh};
}


export async function proposeWheelV3Schedule(client,{
  assignmentId,
  proposedByPairId,
  scheduledAt,
  locationText,
  venueId=null,
}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||!['open','result_pending'].includes(assignment.status))throw new Error('Assignment no disponible');
  const proposer=Number(proposedByPairId);
  if(![Number(assignment.pair_a_id),Number(assignment.pair_b_id)].includes(proposer))throw new Error('Pareja proponente inválida');

  const location=String(locationText||'').trim().replace(/\s+/g,' ');
  if(location.length<2||location.length>160)throw new Error('Lugar inválido');

  const when=new Date(scheduledAt);
  if(Number.isNaN(when.getTime()))throw new Error('Fecha inválida');
  const now=(await q(client,`SELECT CURRENT_TIMESTAMP now`)).rows[0].now;
  if(when<=new Date(now))throw new Error('La fecha debe ser futura');
  if(when>new Date(assignment.deadline_at))throw new Error('La fecha supera el plazo de 30 días');

  await q(client,`
    UPDATE wheel_schedule_proposals
    SET status='replaced',responded_at=CURRENT_TIMESTAMP
    WHERE assignment_id=$1 AND status='pending'
  `,[assignmentId]);

  const proposal=(await q(client,`
    INSERT INTO wheel_schedule_proposals(
      assignment_id,proposed_by_pair_id,scheduled_at,location_text,venue_id,
      response_deadline_at
    )
    VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP+interval '48 hours')
    RETURNING *
  `,[assignmentId,proposer,when,location,venueId])).rows[0];
  await queueAssignmentNotification(client,assignment,{
    type:'schedule_proposal',
    title:'Nueva propuesta de fecha',
    body:'Hay una nueva propuesta de fecha y lugar. La otra pareja tiene 48 horas para responder.',
    payload:{assignmentId,proposalId:proposal.id,responseDeadlineAt:proposal.response_deadline_at},
    dedupeKey:`v3-schedule-proposal:${proposal.id}`,
  });
  return proposal;
}

export async function acceptWheelV3Schedule(client,{
  assignmentId,
  proposalId,
  acceptingPairId,
}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||!['open','result_pending'].includes(assignment.status))throw new Error('Assignment no disponible');

  const proposal=(await q(client,`
    SELECT *
    FROM wheel_schedule_proposals
    WHERE id=$1
      AND assignment_id=$2
      AND status='pending'
    FOR UPDATE
  `,[proposalId,assignmentId])).rows[0];
  if(!proposal)throw new Error('Propuesta inexistente o resuelta');
  if(Number(proposal.proposed_by_pair_id)===Number(acceptingPairId))throw new Error('La otra pareja debe aceptar');
  if(![Number(assignment.pair_a_id),Number(assignment.pair_b_id)].includes(Number(acceptingPairId)))throw new Error('Pareja aceptante inválida');

  const valid=(await q(client,`SELECT CURRENT_TIMESTAMP<=$1::timestamptz ok`,[proposal.response_deadline_at])).rows[0].ok;
  if(!valid)throw new Error('La propuesta venció');

  await q(client,`
    UPDATE wheel_schedule_proposals
    SET status='accepted',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[proposal.id]);

  const updated=(await q(client,`
    UPDATE wheel_assignments
    SET
      scheduled_at=$2,
      location_text=$3,
      venue_id=$4,
      schedule_confirmed_at=CURRENT_TIMESTAMP
    WHERE id=$1
    RETURNING *
  `,[assignmentId,proposal.scheduled_at,proposal.location_text,proposal.venue_id])).rows[0];
  await queueAssignmentNotification(client,updated,{
    type:'schedule_confirmed',
    title:'Fecha confirmada',
    body:'La fecha y el lugar del partido quedaron confirmados por ambas parejas.',
    payload:{assignmentId,scheduledAt:updated.scheduled_at,locationText:updated.location_text},
    dedupeKey:`v3-schedule-confirmed:${proposal.id}`,
  });
  return updated;
}

export async function cancelWheelV3ScheduleProposal(client,{
  assignmentId,
  proposalId,
  proposedByPairId,
}){
  const row=(await q(client,`
    UPDATE wheel_schedule_proposals
    SET status='cancelled',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
      AND assignment_id=$2
      AND proposed_by_pair_id=$3
      AND status='pending'
    RETURNING *
  `,[proposalId,assignmentId,proposedByPairId])).rows[0];
  if(!row)throw new Error('Propuesta no disponible para cancelar');
  return row;
}


async function wheelV3AdminAudit(client,{adminUserId,action,targetType,targetId,data={}}){
  return (await q(client,`
    INSERT INTO admin_audit_events(admin_user_id,action,target_type,target_id,data)
    VALUES($1,$2,$3,$4,$5::jsonb)
    RETURNING *
  `,[adminUserId,action,targetType,targetId,JSON.stringify(data)])).rows[0];
}

export async function resolveWheelV3ResultDispute(client,{
  assignmentId,
  versionId,
  adminUserId,
}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||assignment.status!=='disputed')throw new Error('Assignment no está en disputa');

  const version=(await q(client,`
    SELECT *
    FROM wheel_result_versions
    WHERE id=$1 AND assignment_id=$2
    FOR UPDATE
  `,[versionId,assignmentId])).rows[0];
  if(!version)throw new Error('Versión de resultado inválida');

  const result=await applyWheelV3ConfirmedRealResult(client,{
    assignmentId,
    winnerPairId:version.winner_pair_id,
    resultType:version.result_type,
    score:version.score,
    abandonedPairId:version.abandoned_pair_id,
    playedAt:version.played_at,
    resolutionSource:'admin_selected_version',
  });
  await wheelV3AdminAudit(client,{
    adminUserId,
    action:'wheel_v3_resolve_result_dispute',
    targetType:'wheel_assignment',
    targetId:assignmentId,
    data:{versionId:Number(versionId),winnerPairId:Number(version.winner_pair_id)},
  });
  return result;
}

export async function dismissWheelV3NoShowByAdmin(client,{
  assignmentId,
  adminUserId,
}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||assignment.status!=='disputed')throw new Error('Assignment no está bloqueado por disputa');

  const noShow=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('contested','admin_review')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!noShow)throw new Error('No existe no-show pendiente de Administración');

  await q(client,`
    UPDATE wheel_no_shows
    SET status='resolved',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[noShow.id]);
  const status=assignment.first_result_at?'result_pending':'open';
  await q(client,`
    UPDATE wheel_assignments
    SET status=$2
    WHERE id=$1
  `,[assignmentId,status]);

  await queueAssignmentNotification(client,assignment,{
    type:'no_show_dismissed',
    title:'No-show resuelto',
    body:'Administración cerró el reporte de no-show sin aplicar una consecuencia deportiva. El compromiso continúa.',
    payload:{assignmentId,status},
    dedupeKey:`v3-no-show-dismissed:${noShow.id}`,
  });
  await wheelV3AdminAudit(client,{
    adminUserId,
    action:'wheel_v3_dismiss_no_show',
    targetType:'wheel_assignment',
    targetId:assignmentId,
    data:{noShowId:Number(noShow.id),restoredStatus:status},
  });
  return {assignmentId:Number(assignmentId),status};
}

export async function resolveWheelV3NoShowByAdmin(client,{
  assignmentId,
  failingPairId,
  adminUserId,
}){
  const assignment=(await q(client,`
    SELECT *
    FROM wheel_assignments
    WHERE id=$1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!assignment||assignment.status!=='disputed')throw new Error('Assignment no está bloqueado por disputa');

  const noShow=(await q(client,`
    SELECT *
    FROM wheel_no_shows
    WHERE assignment_id=$1
      AND status IN('contested','admin_review')
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE
  `,[assignmentId])).rows[0];
  if(!noShow)throw new Error('No existe no-show pendiente de Administración');

  const pairIds=[Number(assignment.pair_a_id),Number(assignment.pair_b_id)];
  const failing=Number(failingPairId);
  if(!pairIds.includes(failing))throw new Error('Pareja incumplidora inválida');

  await q(client,`
    UPDATE wheel_no_shows
    SET status='accepted',responded_at=CURRENT_TIMESTAMP
    WHERE id=$1
  `,[noShow.id]);
  await q(client,`UPDATE wheel_assignments SET status='open' WHERE id=$1`,[assignmentId]);

  const result=await applyWheelV3OneSidedFailure(client,{
    assignmentId,
    failingPairId:failing,
    resolutionSource:'admin_no_show_resolution',
    countsAsFirstPlaceDefense:true,
  });
  await wheelV3AdminAudit(client,{
    adminUserId,
    action:'wheel_v3_resolve_no_show',
    targetType:'wheel_assignment',
    targetId:assignmentId,
    data:{noShowId:Number(noShow.id),failingPairId:failing},
  });
  return result;
}
