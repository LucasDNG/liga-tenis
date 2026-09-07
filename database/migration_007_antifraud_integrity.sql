BEGIN;


/*
  ============================================================
  ELIMINAR BANDERAS DUPLICADAS EXISTENTES
  ============================================================

  Para cada combinación:

  match_id + flag_type

  conservamos solamente la alerta
  más antigua.
*/

DELETE FROM match_audit_flags duplicate
USING match_audit_flags original

WHERE duplicate.match_id =
      original.match_id

  AND duplicate.flag_type =
      original.flag_type

  AND duplicate.id >
      original.id;


/*
  ============================================================
  GARANTIZAR UNA SOLA BANDERA POR TIPO Y PARTIDO
  ============================================================

  Esto hace que:

  ON CONFLICT (
    match_id,
    flag_type
  )

  sea seguro incluso cuando dos requests
  intentan crear la alerta al mismo tiempo.
*/

CREATE UNIQUE INDEX IF NOT EXISTS
idx_match_audit_flags_match_type_unique

ON match_audit_flags (
  match_id,
  flag_type
);


/*
  ============================================================
  ÍNDICE PARA CONSULTAS DE PARTIDOS FRECUENTES
  ============================================================

  checkFrequentOpponents filtra por:
  - status
  - annulled_at
  - completed_at
  - jugadores
*/

CREATE INDEX IF NOT EXISTS
idx_matches_completed_players_antifraud

ON matches (
  player1_id,
  player2_id,
  completed_at
)

WHERE status = 'completed'
  AND annulled_at IS NULL;


/*
  ============================================================
  ÍNDICE PARA ANÁLISIS DE ELO
  ============================================================

  checkEloConcentration consulta repetidamente
  eventos match_result no revertidos.
*/

CREATE INDEX IF NOT EXISTS
idx_elo_events_antifraud_user_created

ON elo_events (
  user_id,
  created_at,
  id
)

WHERE event_type = 'match_result'
  AND reversed_at IS NULL;


COMMIT;