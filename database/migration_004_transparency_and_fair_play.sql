BEGIN;


/* =========================================================
   1. DESAFÍOS
   ========================================================= */

/*
  Lugar donde se va a jugar.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS venue VARCHAR(160);


/*
  Fecha y hora acordadas.
  TIMESTAMPTZ nos permite manejar correctamente
  la fecha aunque Render trabaje en UTC.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;


/*
  Usuario que cargó o modificó
  el lugar y horario.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS schedule_updated_by INTEGER
REFERENCES users(id);


/*
  Fecha en que el rival aceptó.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;


/*
  Fecha en que fue rechazado.
  Después la usaremos para impedir
  volver a desafiar durante 7 días.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;


/*
  Elo descontado por rechazar.
  Lo dejamos registrado en el propio desafío.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS rejection_elo_penalty INTEGER
NOT NULL
DEFAULT 0;


/*
  Cantidad de partidos históricos contra
  ese rival cuando se creó el desafío.

  Esto nos servirá para construir
  la rueda de rivales.
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS historical_meetings_at_creation INTEGER
NOT NULL
DEFAULT 0;


/*
  Fecha en que este desafío dejó
  definitivamente de estar activo.

  Puede ser porque:
  - se jugó
  - se rechazó
  - fue anulado
*/
ALTER TABLE challenges
ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;


/* =========================================================
   2. PARTIDOS PROGRAMADOS
   ========================================================= */

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS venue VARCHAR(160);


ALTER TABLE matches
ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;


/*
  Cuándo se cargó el resultado.
*/
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS result_submitted_at TIMESTAMPTZ;


/*
  Cuándo lo confirmó el rival.
*/
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS result_confirmed_at TIMESTAMPTZ;


/*
  Quién confirmó el resultado.
*/
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS result_confirmed_by INTEGER
REFERENCES users(id);


/*
  Cantidad de veces que el resultado
  fue rechazado antes de confirmarse.
*/
ALTER TABLE matches
ADD COLUMN IF NOT EXISTS result_rejection_count INTEGER
NOT NULL
DEFAULT 0;


/* =========================================================
   3. ANULACIÓN ADMINISTRATIVA
   ========================================================= */

/*
  No vamos a borrar partidos sospechosos.
  Se anulan y queda registro.
*/

ALTER TABLE matches
ADD COLUMN IF NOT EXISTS annulled_at TIMESTAMPTZ;


ALTER TABLE matches
ADD COLUMN IF NOT EXISTS annulled_by INTEGER
REFERENCES users(id);


ALTER TABLE matches
ADD COLUMN IF NOT EXISTS annul_reason TEXT;


/* =========================================================
   4. HISTORIAL DE MOVIMIENTOS DE ELO
   ========================================================= */

/*
  Esta tabla es fundamental.

  Cada vez que cambie Elo:
  - partido
  - rechazo de desafío
  - reversión administrativa

  queda una operación registrada.
*/

CREATE TABLE IF NOT EXISTS elo_events (
  id SERIAL PRIMARY KEY,

  user_id INTEGER
    NOT NULL
    REFERENCES users(id),

  match_id INTEGER
    REFERENCES matches(id),

  challenge_id INTEGER
    REFERENCES challenges(id),

  event_type VARCHAR(40)
    NOT NULL,

  elo_before INTEGER
    NOT NULL,

  elo_change INTEGER
    NOT NULL,

  elo_after INTEGER
    NOT NULL,

  description TEXT,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP,

  reversed_at TIMESTAMPTZ,

  reversed_by INTEGER
    REFERENCES users(id)
);


/*
  Los tipos que vamos a manejar serán:

  match_result
  challenge_rejection
  admin_reversal
  admin_adjustment
*/


/* =========================================================
   5. BANDERAS ANTIFRAUDE
   ========================================================= */

CREATE TABLE IF NOT EXISTS match_audit_flags (
  id SERIAL PRIMARY KEY,

  match_id INTEGER
    NOT NULL
    REFERENCES matches(id),

  flag_type VARCHAR(60)
    NOT NULL,

  severity VARCHAR(20)
    NOT NULL
    DEFAULT 'warning',

  message TEXT
    NOT NULL,

  resolved BOOLEAN
    NOT NULL
    DEFAULT FALSE,

  resolved_at TIMESTAMPTZ,

  resolved_by INTEGER
    REFERENCES users(id),

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


/*
  Ejemplos de flag_type:

  result_too_fast
  frequent_opponents
  elo_concentration
  repeated_result_rejection
*/


/* =========================================================
   6. AUDITORÍA GENERAL
   ========================================================= */

/*
  Guardamos acciones importantes para que
  no desaparezca el historial.

  Ejemplos:
  - desafío rechazado
  - turno modificado
  - resultado enviado
  - resultado rechazado
  - resultado confirmado
  - partido anulado
*/

CREATE TABLE IF NOT EXISTS audit_events (
  id SERIAL PRIMARY KEY,

  user_id INTEGER
    REFERENCES users(id),

  challenge_id INTEGER
    REFERENCES challenges(id),

  match_id INTEGER
    REFERENCES matches(id),

  event_type VARCHAR(60)
    NOT NULL,

  details JSONB,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT CURRENT_TIMESTAMP
);


/* =========================================================
   7. ÍNDICES
   ========================================================= */

CREATE INDEX IF NOT EXISTS
idx_challenges_scheduled_at
ON challenges(scheduled_at);


CREATE INDEX IF NOT EXISTS
idx_challenges_status
ON challenges(status);


CREATE INDEX IF NOT EXISTS
idx_challenges_rejected_at
ON challenges(rejected_at);


CREATE INDEX IF NOT EXISTS
idx_challenges_challenger_challenged
ON challenges(
  challenger_id,
  challenged_id
);


CREATE INDEX IF NOT EXISTS
idx_matches_scheduled_at
ON matches(scheduled_at);


CREATE INDEX IF NOT EXISTS
idx_matches_status
ON matches(status);


CREATE INDEX IF NOT EXISTS
idx_matches_completed_at
ON matches(completed_at);


CREATE INDEX IF NOT EXISTS
idx_elo_events_user
ON elo_events(user_id);


CREATE INDEX IF NOT EXISTS
idx_elo_events_match
ON elo_events(match_id);


CREATE INDEX IF NOT EXISTS
idx_elo_events_challenge
ON elo_events(challenge_id);


CREATE INDEX IF NOT EXISTS
idx_match_audit_flags_match
ON match_audit_flags(match_id);


CREATE INDEX IF NOT EXISTS
idx_match_audit_flags_unresolved
ON match_audit_flags(resolved)
WHERE resolved = FALSE;


CREATE INDEX IF NOT EXISTS
idx_audit_events_user
ON audit_events(user_id);


CREATE INDEX IF NOT EXISTS
idx_audit_events_match
ON audit_events(match_id);


CREATE INDEX IF NOT EXISTS
idx_audit_events_challenge
ON audit_events(challenge_id);


COMMIT;