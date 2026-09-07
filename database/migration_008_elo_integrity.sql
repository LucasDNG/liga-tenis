BEGIN;


/* =========================================================
   1. UN SOLO MOVIMIENTO ELO POR JUGADOR/PARTIDO
   =========================================================

   Para un mismo partido cada jugador puede tener
   solamente un evento original "match_result".

   Esto protege incluso si por algún error dos requests
   intentaran aplicar Elo dos veces.
*/

CREATE UNIQUE INDEX IF NOT EXISTS
idx_elo_events_match_user_result_unique

ON elo_events (
  match_id,
  user_id
)

WHERE
  match_id IS NOT NULL
  AND event_type = 'match_result';


/* =========================================================
   2. BÚSQUEDA DE RÉCORDS HISTÓRICOS
   =========================================================

   Este índice acelera:
   - récord personal
   - Top 3 histórico
   - historial público
*/

CREATE INDEX IF NOT EXISTS
idx_elo_events_historical_peak

ON elo_events (
  user_id,
  elo_after DESC,
  created_at ASC
)

WHERE
  reversed_at IS NULL;


/* =========================================================
   3. CONSULTAS POR PARTIDO
   ========================================================= */

CREATE INDEX IF NOT EXISTS
idx_elo_events_match_created

ON elo_events (
  match_id,
  created_at ASC
)

WHERE
  match_id IS NOT NULL;


COMMIT;