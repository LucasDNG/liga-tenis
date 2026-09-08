import { pool } from "../db.js";

import {
  createMatchAuditFlag,
  checkFrequentOpponents,
  checkEloConcentration,
} from "../services/antifraud.service.js";


const PLACEMENT_MATCHES = 5;
const PLACEMENT_K = 64;
const NORMAL_K = 32;

const OFFICIAL_ELO_FLOOR = 100;

const RANKED_LOSS_TO_PROVISIONAL_MIN = 200;
const RANKED_LOSS_TO_PROVISIONAL_PERCENT = 0.12;
const RANKED_LOSS_TO_PROVISIONAL_MAX = 300;

const TOO_FAST_RESULT_MINUTES = 40;


/*
  ============================================================
  VALIDACIÓN DE GAME
  ============================================================
*/

const parseGameValue = (value) => {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    typeof value === "boolean"
  ) {
    return null;
  }

  if (
    typeof value !== "number" &&
    typeof value !== "string"
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    value.trim() === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isInteger(number)
    ? number
    : null;
};


/*
  ============================================================
  VALIDACIÓN DE SET
  ============================================================
*/

const isValidSet = (a, b) => {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0
  ) {
    return false;
  }

  const max = Math.max(a, b);
  const min = Math.min(a, b);

  if (
    max === 6 &&
    min <= 4
  ) {
    return true;
  }

  if (
    max === 7 &&
    (min === 5 || min === 6)
  ) {
    return true;
  }

  return false;
};


/*
  ============================================================
  SCORE COMPLETO
  ============================================================
*/

const parseScore = (score) => {
  if (
    !Array.isArray(score) ||
    (
      score.length !== 2 &&
      score.length !== 3
    )
  ) {
    return {
      error:
        "El partido debe tener exactamente 2 o 3 sets",
    };
  }

  const normalizedScore = [];
  const setWinners = [];

  for (
    let i = 0;
    i < score.length;
    i++
  ) {
    const currentSet = score[i];

    if (
      !currentSet ||
      typeof currentSet !== "object" ||
      Array.isArray(currentSet)
    ) {
      return {
        error:
          `El Set ${i + 1} no tiene un formato válido.`,
      };
    }

    const a =
      parseGameValue(currentSet.p1);

    const b =
      parseGameValue(currentSet.p2);

    if (
      a === null ||
      b === null
    ) {
      return {
        error:
          `Completá correctamente los dos valores del Set ${i + 1}.`,
      };
    }

    if (!isValidSet(a, b)) {
      return {
        error:
          `El Set ${i + 1} no es válido. Ejemplos: 6-4, 7-5 o 7-6.`,
      };
    }

    normalizedScore.push({
      p1: a,
      p2: b,
    });

    setWinners.push(
      a > b ? 1 : 2,
    );
  }

  if (
    normalizedScore.length === 2
  ) {
    if (
      setWinners[0] !==
      setWinners[1]
    ) {
      return {
        error:
          "Si cada jugador ganó un set, tenés que cargar el tercer set.",
      };
    }

    return {
      winnerSide:
        setWinners[0],

      normalizedScore,
    };
  }

  if (
    setWinners[0] ===
    setWinners[1]
  ) {
    return {
      error:
        "Si un jugador ganó los dos primeros sets no corresponde cargar un tercer set.",
    };
  }

  return {
    winnerSide:
      setWinners[2],

    normalizedScore,
  };
};


/*
  ============================================================
  HELPERS ELO
  ============================================================
*/

const isProvisional = (
  matchesPlayed,
) =>
  matchesPlayed <
  PLACEMENT_MATCHES;


const expectedScore = (
  ownRating,
  opponentRating,
) =>
  1 /
  (
    1 +
    10 **
      (
        (
          opponentRating -
          ownRating
        ) /
        400
      )
  );


const normalEloChange = ({
  ownRating,
  opponentRating,
  k,
  won,
}) => {
  const expected =
    expectedScore(
      ownRating,
      opponentRating,
    );

  return Math.round(
    k *
      (
        (won ? 1 : 0) -
        expected
      ),
  );
};


const getRankedLossToProvisionalPenalty =
  (rating) => {
    const percentage =
      Math.round(
        rating *
          RANKED_LOSS_TO_PROVISIONAL_PERCENT,
      );

    return Math.min(
      RANKED_LOSS_TO_PROVISIONAL_MAX,
      Math.max(
        RANKED_LOSS_TO_PROVISIONAL_MIN,
        percentage,
      ),
    );
  };


/*
  ============================================================
  RANKING OFICIAL PRE-PARTIDO
  ============================================================
*/

const getOfficialRankingSnapshot =
  async (
    client,
    city,
    gender,
  ) => {
    const result =
      await client.query(
        `
        SELECT
          id,
          name,
          rating,
          matches_played,

          ROW_NUMBER() OVER (
            ORDER BY
              rating DESC,
              matches_played DESC,
              id ASC
          )::int AS position

        FROM users

        WHERE
          role = 'player'
          AND verification_status = 'verified'
          AND city = $1
          AND gender = $2
          AND matches_played >= $3

        ORDER BY
          position ASC
        `,
        [
          city,
          gender,
          PLACEMENT_MATCHES,
        ],
      );

    return result.rows.map(
      (row) => ({
        ...row,

        id:
          Number(row.id),

        rating:
          Number(row.rating),

        matches_played:
          Number(row.matches_played),

        position:
          Number(row.position),
      }),
    );
  };


/*
  ============================================================
  PARTIDOS DEL USUARIO
  ============================================================
*/

export const getMyMatches =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const result =
        await pool.query(
          `
          SELECT
            m.*,

            p1.name AS player1_name,
            p1.phone AS player1_phone,

            p2.name AS player2_name,
            p2.phone AS player2_phone,

            w.name AS winner_name,

            confirmer.name AS
              result_confirmed_by_name

          FROM matches m

          JOIN users p1
            ON p1.id = m.player1_id

          JOIN users p2
            ON p2.id = m.player2_id

          LEFT JOIN users w
            ON w.id = m.winner_id

          LEFT JOIN users confirmer
            ON confirmer.id =
               m.result_confirmed_by

          WHERE
            (
              m.player1_id = $1
              OR
              m.player2_id = $1
            )
            AND m.annulled_at IS NULL

          ORDER BY
            m.created_at DESC,
            m.id DESC
          `,
          [req.userId],
        );

      res.json({
        matches:
          result.rows,
      });
    } catch (error) {
      next(error);
    }
  };


/*
  ============================================================
  CARGAR RESULTADO
  ============================================================
*/

export const submitMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const { score } =
        req.body;

      const parsed =
        parseScore(score);

      if (parsed.error) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              parsed.error,

            reason:
              "invalid_score",
          });
      }

      const normalizedScore =
        parsed.normalizedScore;

      const matchResult =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1
            AND status = 'pending'
            AND annulled_at IS NULL
            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
          ],
        );

      if (
        !matchResult.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(404)
          .json({
            message:
              "Partido pendiente no encontrado",

            reason:
              "match_not_found",
          });
      }

      const match =
        matchResult.rows[0];

      if (
        !match.scheduled_at
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              "Este partido no tiene fecha y hora registradas.",

            reason:
              "schedule_missing",
          });
      }

      const scheduledTime =
        new Date(
          match.scheduled_at,
        ).getTime();

      if (
        Number.isNaN(
          scheduledTime,
        )
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(400)
          .json({
            message:
              "La fecha y hora registradas para este partido no son válidas.",

            reason:
              "invalid_schedule",
          });
      }

      const now =
        Date.now();

      if (
        scheduledTime > now
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(403)
          .json({
            message:
              "Todavía no podés cargar el resultado. El partido aún no llegó a su horario programado.",

            reason:
              "match_not_started",

            available_at:
              match.scheduled_at,
          });
      }

      const winnerId =
        parsed.winnerSide === 1
          ? match.player1_id
          : match.player2_id;

      const updated =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id = $1,
            proposed_score = $2,
            result_submitted_by = $3,
            result_submitted_at =
              CURRENT_TIMESTAMP,
            status =
              'awaiting_confirmation'

          WHERE
            id = $4
            AND status = 'pending'
            AND annulled_at IS NULL

          RETURNING *
          `,
          [
            winnerId,

            JSON.stringify(
              normalizedScore,
            ),

            req.userId,
            match.id,
          ],
        );

      if (
        !updated.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió. Actualizá la página e intentá nuevamente.",

            reason:
              "match_state_changed",
          });
      }

      await client.query(
        `
        INSERT INTO audit_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          details
        )

        VALUES (
          $1,
          $2,
          $3,
          'match_result_submitted',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            winner_id:
              winnerId,

            score:
              normalizedScore,
          }),
        ],
      );

      const minutesSinceStart =
        Math.floor(
          (
            now -
            scheduledTime
          ) /
            60000,
        );

      if (
        minutesSinceStart >= 0 &&
        minutesSinceStart <
          TOO_FAST_RESULT_MINUTES
      ) {
        await createMatchAuditFlag(
          client,
          {
            matchId:
              match.id,

            flagType:
              "result_too_fast",

            message:
              `El resultado fue cargado ${minutesSinceStart} minutos después del horario programado.`,
          },
        );
      }

      await client.query(
        "COMMIT",
      );

      res.json({
        message:
          "Resultado enviado. Esperando confirmación del rival.",

        match:
          updated.rows[0],
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // conexión liberada abajo
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  RECHAZAR RESULTADO
  ============================================================
*/

export const rejectMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      const found =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1
            AND status =
              'awaiting_confirmation'
            AND annulled_at IS NULL
            AND result_submitted_by <> $2
            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
          ],
        );

      if (
        !found.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(404)
          .json({
            message:
              "Resultado para confirmar no encontrado",

            reason:
              "result_not_found",
          });
      }

      const current =
        found.rows[0];

      const result =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id = NULL,
            proposed_score = NULL,
            result_submitted_by = NULL,
            result_submitted_at = NULL,

            result_rejection_count =
              COALESCE(
                result_rejection_count,
                0
              ) + 1,

            status = 'pending'

          WHERE
            id = $1
            AND status =
              'awaiting_confirmation'
            AND annulled_at IS NULL

          RETURNING *
          `,
          [current.id],
        );

      if (
        !result.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del resultado cambió. Actualizá la página.",

            reason:
              "result_state_changed",
          });
      }

      const match =
        result.rows[0];

      await client.query(
        `
        INSERT INTO audit_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          details
        )

        VALUES (
          $1,
          $2,
          $3,
          'match_result_rejected',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            rejection_count:
              match
                .result_rejection_count,

            rejected_submission_by:
              current
                .result_submitted_by,

            rejected_winner_id:
              current
                .proposed_winner_id,

            rejected_score:
              current
                .proposed_score,
          }),
        ],
      );

      if (
        match
          .result_rejection_count >=
        2
      ) {
        await createMatchAuditFlag(
          client,
          {
            matchId:
              match.id,

            flagType:
              "repeated_result_rejection",

            message:
              `El resultado de este partido ya fue rechazado ${match.result_rejection_count} veces.`,
          },
        );
      }

      await client.query(
        "COMMIT",
      );

      res.json({
        message:
          "Resultado rechazado. Puede cargarse nuevamente.",

        rejection_count:
          match
            .result_rejection_count,
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // conexión liberada abajo
      }

      next(error);
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  CONFIRMAR RESULTADO
  ============================================================
*/

export const confirmMatchResult =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        "BEGIN",
      );

      /*
        BLOQUEAR PARTIDO
      */

      const found =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE
            id = $1
            AND status =
              'awaiting_confirmation'
            AND result_submitted_by <> $2
            AND annulled_at IS NULL
            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          FOR UPDATE
          `,
          [
            req.params.id,
            req.userId,
          ],
        );

      if (
        !found.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(404)
          .json({
            message:
              "Resultado para confirmar no encontrado",

            reason:
              "result_not_found",
          });
      }

      const match =
        found.rows[0];

      /*
        REVALIDAR SCORE
      */

      let proposedScore =
        match.proposed_score;

      if (
        typeof proposedScore ===
        "string"
      ) {
        try {
          proposedScore =
            JSON.parse(
              proposedScore,
            );
        } catch {
          proposedScore = null;
        }
      }

      const parsed =
        parseScore(
          proposedScore,
        );

      if (parsed.error) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El resultado almacenado no es válido y no puede confirmarse.",

            reason:
              "invalid_stored_score",
          });
      }

      proposedScore =
        parsed.normalizedScore;

      const expectedWinnerId =
        parsed.winnerSide === 1
          ? Number(
              match.player1_id,
            )
          : Number(
              match.player2_id,
            );

      if (
        Number(
          match.proposed_winner_id,
        ) !== expectedWinnerId
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El ganador almacenado no coincide con el resultado cargado.",

            reason:
              "winner_score_mismatch",
          });
      }

      /*
        BLOQUEAR JUGADORES
      */

      const players =
        await client.query(
          `
          SELECT
            id,
            name,
            rating,
            matches_played,
            city,
            gender,
            role,
            verification_status

          FROM users

          WHERE id IN (
            $1,
            $2
          )

          ORDER BY id ASC

          FOR UPDATE
          `,
          [
            match.player1_id,
            match.player2_id,
          ],
        );

      if (
        players.rowCount !== 2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "No se pudieron cargar correctamente los dos jugadores del partido.",

            reason:
              "players_not_found",
          });
      }

      const player1 =
        players.rows.find(
          (player) =>
            Number(player.id) ===
            Number(
              match.player1_id,
            ),
        );

      const player2 =
        players.rows.find(
          (player) =>
            Number(player.id) ===
            Number(
              match.player2_id,
            ),
        );

      if (
        !player1 ||
        !player2
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los jugadores del partido no son válidos.",

            reason:
              "invalid_players",
          });
      }

      if (
        player1.role !== "player" ||
        player2.role !== "player" ||
        player1.verification_status !==
          "verified" ||
        player2.verification_status !==
          "verified" ||
        player1.city !==
          player2.city ||
        player1.gender !==
          player2.gender
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los jugadores ya no cumplen las condiciones de esta liga.",

            reason:
              "players_not_eligible",
          });
      }

      const winnerId =
        Number(
          match.proposed_winner_id,
        );

      const loserId =
        winnerId ===
        Number(
          match.player1_id,
        )
          ? Number(
              match.player2_id,
            )
          : Number(
              match.player1_id,
            );

      const winnerPlayer =
        winnerId ===
        Number(player1.id)
          ? player1
          : player2;

      const loserPlayer =
        loserId ===
        Number(player1.id)
          ? player1
          : player2;

      const winnerRating =
        Number(
          winnerPlayer.rating,
        );

      const loserRating =
        Number(
          loserPlayer.rating,
        );

      const winnerMatchesPlayed =
        Number(
          winnerPlayer
            .matches_played,
        );

      const loserMatchesPlayed =
        Number(
          loserPlayer
            .matches_played,
        );

      if (
        !Number.isInteger(
          winnerRating,
        ) ||
        !Number.isInteger(
          loserRating,
        ) ||
        winnerRating < 0 ||
        loserRating < 0 ||
        !Number.isInteger(
          winnerMatchesPlayed,
        ) ||
        !Number.isInteger(
          loserMatchesPlayed,
        ) ||
        winnerMatchesPlayed < 0 ||
        loserMatchesPlayed < 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los datos de ranking de los jugadores no son válidos.",

            reason:
              "invalid_rating_data",
          });
      }

      const winnerProvisional =
        isProvisional(
          winnerMatchesPlayed,
        );

      const loserProvisional =
        isProvisional(
          loserMatchesPlayed,
        );

      const winnerMatchesAfter =
        winnerMatchesPlayed + 1;

      const loserMatchesAfter =
        loserMatchesPlayed + 1;

      const winnerCompletedPlacement =
        winnerProvisional &&
        winnerMatchesAfter ===
          PLACEMENT_MATCHES;

      const loserCompletedPlacement =
        loserProvisional &&
        loserMatchesAfter ===
          PLACEMENT_MATCHES;

      /*
        SNAPSHOT DEL RANKING
      */

      const rankingBefore =
        await getOfficialRankingSnapshot(
          client,
          winnerPlayer.city,
          winnerPlayer.gender,
        );

      const winnerRankBefore =
        rankingBefore.find(
          (player) =>
            player.id === winnerId,
        )?.position || null;

      const loserRankBefore =
        rankingBefore.find(
          (player) =>
            player.id === loserId,
        )?.position || null;

      const numberTwoBefore =
        rankingBefore.find(
          (player) =>
            player.position === 2,
        ) || null;

      /*
        ========================================================
        GANADOR
        ========================================================
      */

      let winnerAfterMatch =
        winnerRating;

      let winnerCalculationType =
        "normal";

      if (
        winnerProvisional &&
        loserProvisional
      ) {
        const winnerDelta =
          normalEloChange({
            ownRating:
              winnerRating,

            opponentRating:
              loserRating,

            k:
              PLACEMENT_K,

            won: true,
          });

        winnerAfterMatch =
          Math.max(
            0,
            winnerRating +
              winnerDelta,
          );

        winnerCalculationType =
          "placement_vs_placement";
      }

      else if (
        winnerProvisional &&
        !loserProvisional
      ) {
        const ratingGap =
          Math.max(
            0,
            loserRating -
              winnerRating,
          );

        const placementBonus =
          Math.min(
            236,
            Math.round(
              ratingGap *
                0.18,
            ),
          );

        const winnerDelta =
          Math.min(
            300,
            PLACEMENT_K +
              placementBonus,
          );

        winnerAfterMatch =
          winnerRating +
          winnerDelta;

        winnerCalculationType =
          "placement_beats_ranked";
      }

      else {
        const winnerDelta =
          normalEloChange({
            ownRating:
              winnerRating,

            opponentRating:
              loserRating,

            k:
              NORMAL_K,

            won: true,
          });

        winnerAfterMatch =
          Math.max(
            OFFICIAL_ELO_FLOOR,
            winnerRating +
              winnerDelta,
          );

        winnerCalculationType =
          loserProvisional
            ? "ranked_beats_placement"
            : "normal_ranked";
      }

      /*
        ========================================================
        PERDEDOR
        ========================================================
      */

      let loserAfterMatch =
        loserRating;

      let loserCalculationType =
        "normal";

      let specialProvisionalPenalty =
        null;

      if (
        loserProvisional
      ) {
        /*
          Si ambos siguen en placement,
          ambos usan K64.

          Si pierde contra un oficial,
          la derrota usa K32.
        */

        const lossK =
          winnerProvisional
            ? PLACEMENT_K
            : NORMAL_K;

        const lossDelta =
          normalEloChange({
            ownRating:
              loserRating,

            opponentRating:
              winnerRating,

            k:
              lossK,

            won: false,
          });

        loserAfterMatch =
          Math.max(
            0,
            loserRating +
              lossDelta,
          );

        loserCalculationType =
          winnerProvisional
            ? "placement_loses_to_placement"
            : "placement_loses_to_ranked";
      }

      else if (
        winnerProvisional
      ) {
        specialProvisionalPenalty =
          getRankedLossToProvisionalPenalty(
            loserRating,
          );

        loserAfterMatch =
          Math.max(
            OFFICIAL_ELO_FLOOR,
            loserRating -
              specialProvisionalPenalty,
          );

        loserCalculationType =
          "ranked_loses_to_placement";
      }

      else {
        const lossDelta =
          normalEloChange({
            ownRating:
              loserRating,

            opponentRating:
              winnerRating,

            k:
              NORMAL_K,

            won: false,
          });

        /*
          Un oficial normal nunca debería
          arrancar debajo de 100.

          La única excepción teórica es
          el choque extremo con la regla
          literal del #1.

          Si ya viniera debajo de 100,
          una derrota jamás puede regalarle
          Elo para subirlo artificialmente.
        */

        if (
          loserRating >=
          OFFICIAL_ELO_FLOOR
        ) {
          loserAfterMatch =
            Math.max(
              OFFICIAL_ELO_FLOOR,
              loserRating +
                lossDelta,
            );
        } else {
          loserAfterMatch =
            Math.max(
              0,
              loserRating +
                lossDelta,
            );
        }

        loserCalculationType =
          "normal_ranked";
      }

      /*
        ========================================================
        REGLA #1
        ========================================================
      */

      let dethroneApplied =
        false;

      let dethroneCeiling =
        null;

      if (
        loserRankBefore === 1 &&
        numberTwoBefore &&
        numberTwoBefore.id !==
          loserId
      ) {
        dethroneCeiling =
          numberTwoBefore.rating -
          1;

        if (
          loserAfterMatch >
          dethroneCeiling
        ) {
          loserAfterMatch =
            dethroneCeiling;

          dethroneApplied =
            true;
        }
      }

      /*
        DELTAS PUROS DEL PARTIDO
      */

      const realWinnerDelta =
        winnerAfterMatch -
        winnerRating;

      const realLoserDelta =
        loserAfterMatch -
        loserRating;

      if (
        !Number.isInteger(
          winnerAfterMatch,
        ) ||
        !Number.isInteger(
          loserAfterMatch,
        ) ||
        winnerAfterMatch < 0 ||
        loserAfterMatch < 0 ||
        realWinnerDelta < 0 ||
        realLoserDelta > 0
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El cálculo Elo produjo un resultado inválido. No se aplicó ningún cambio.",

            reason:
              "elo_invariant_failed",
          });
      }

      /*
        ========================================================
        NORMALIZACIÓN AL COMPLETAR PLACEMENT

        El movimiento del partido se conserva
        íntegro.

        Después del quinto partido, si un
        jugador termina debajo de 100, recibe
        un evento separado de graduación para
        comenzar su etapa oficial en Elo 100.

        Esto evita que una derrota posterior
        pueda regalarle Elo por el piso.
        ========================================================
      */

      const winnerPlacementFloorAdjustment =
        winnerCompletedPlacement &&
        winnerAfterMatch <
          OFFICIAL_ELO_FLOOR
          ? OFFICIAL_ELO_FLOOR -
            winnerAfterMatch
          : 0;

      const loserPlacementFloorAdjustment =
        loserCompletedPlacement &&
        loserAfterMatch <
          OFFICIAL_ELO_FLOOR
          ? OFFICIAL_ELO_FLOOR -
            loserAfterMatch
          : 0;

      const winnerFinalRating =
        winnerAfterMatch +
        winnerPlacementFloorAdjustment;

      const loserFinalRating =
        loserAfterMatch +
        loserPlacementFloorAdjustment;

      /*
        EVITAR DOBLE ELO
      */

      const existingElo =
        await client.query(
          `
          SELECT id

          FROM elo_events

          WHERE
            match_id = $1
            AND event_type =
              'match_result'

          LIMIT 1
          `,
          [match.id],
        );

      if (
        existingElo.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Este partido ya tiene movimientos Elo registrados.",

            reason:
              "elo_already_applied",
          });
      }

      /*
        ACTUALIZAR JUGADORES
      */

      const updatedWinner =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,
            matches_played =
              matches_played + 1,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2
            AND rating = $3
            AND matches_played = $4

          RETURNING
            id,
            rating,
            matches_played
          `,
          [
            winnerFinalRating,
            winnerId,
            winnerRating,
            winnerMatchesPlayed,
          ],
        );

      const updatedLoser =
        await client.query(
          `
          UPDATE users

          SET
            rating = $1,
            matches_played =
              matches_played + 1,
            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            id = $2
            AND rating = $3
            AND matches_played = $4

          RETURNING
            id,
            rating,
            matches_played
          `,
          [
            loserFinalRating,
            loserId,
            loserRating,
            loserMatchesPlayed,
          ],
        );

      if (
        updatedWinner.rowCount !== 1 ||
        updatedLoser.rowCount !== 1
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "Los datos de ranking cambiaron durante la confirmación. No se aplicó el resultado.",

            reason:
              "rating_state_changed",
          });
      }

      /*
        COMPLETAR PARTIDO
      */

      const completedMatch =
        await client.query(
          `
          UPDATE matches

          SET
            winner_id =
              proposed_winner_id,
            score = $1,
            status = 'completed',
            completed_at =
              CURRENT_TIMESTAMP,
            result_confirmed_at =
              CURRENT_TIMESTAMP,
            result_confirmed_by = $2

          WHERE
            id = $3
            AND status =
              'awaiting_confirmation'
            AND annulled_at IS NULL

          RETURNING *
          `,
          [
            JSON.stringify(
              proposedScore,
            ),

            req.userId,
            match.id,
          ],
        );

      if (
        !completedMatch.rowCount
      ) {
        await client.query(
          "ROLLBACK",
        );

        return res
          .status(409)
          .json({
            message:
              "El estado del partido cambió antes de poder confirmarlo.",

            reason:
              "match_state_changed",
          });
      }

      /*
        CERRAR DESAFÍO
      */

      if (
        match.challenge_id
      ) {
        const challenge =
          await client.query(
            `
            UPDATE challenges

            SET
              status = 'completed',
              resolved_at =
                CURRENT_TIMESTAMP

            WHERE
              id = $1
              AND status =
                'accepted'

            RETURNING id
            `,
            [
              match.challenge_id,
            ],
          );

        if (
          !challenge.rowCount
        ) {
          await client.query(
            "ROLLBACK",
          );

          return res
            .status(409)
            .json({
              message:
                "El desafío asociado no se encuentra en un estado válido para finalizar.",

              reason:
                "challenge_state_invalid",
            });
        }
      }

      /*
        ========================================================
        EVENTOS MATCH_RESULT
        ========================================================
      */

      await client.query(
        `
        INSERT INTO elo_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          elo_before,
          elo_change,
          elo_after,
          description
        )

        VALUES (
          $1,
          $2,
          $3,
          'match_result',
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          winnerId,
          match.id,
          match.challenge_id,
          winnerRating,
          realWinnerDelta,
          winnerAfterMatch,

          winnerProvisional
            ? `Victoria de colocación en partido #${match.id}`
            : `Victoria en partido #${match.id}`,
        ],
      );

      await client.query(
        `
        INSERT INTO elo_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          elo_before,
          elo_change,
          elo_after,
          description
        )

        VALUES (
          $1,
          $2,
          $3,
          'match_result',
          $4,
          $5,
          $6,
          $7
        )
        `,
        [
          loserId,
          match.id,
          match.challenge_id,
          loserRating,
          realLoserDelta,
          loserAfterMatch,

          dethroneApplied
            ? `Derrota siendo #1 en partido #${match.id}. Se aplicó regla de destronamiento.`
            : !loserProvisional &&
                winnerProvisional
              ? `Derrota contra provisional en partido #${match.id}. Penalización especial.`
              : loserProvisional
                ? `Derrota de colocación en partido #${match.id}`
                : `Derrota en partido #${match.id}`,
        ],
      );

      /*
        ========================================================
        EVENTOS DE GRADUACIÓN

        No son otro resultado de partido.
        Son una normalización al pasar
        definitivamente a ranking oficial.
        ========================================================
      */

      if (
        winnerPlacementFloorAdjustment >
        0
      ) {
        await client.query(
          `
          INSERT INTO elo_events (
            user_id,
            match_id,
            challenge_id,
            event_type,
            elo_before,
            elo_change,
            elo_after,
            description
          )

          VALUES (
            $1,
            $2,
            $3,
            'placement_completed',
            $4,
            $5,
            $6,
            $7
          )
          `,
          [
            winnerId,
            match.id,
            match.challenge_id,
            winnerAfterMatch,
            winnerPlacementFloorAdjustment,
            winnerFinalRating,

            `Finalización de colocación tras partido #${match.id}. Se aplicó piso oficial de Elo ${OFFICIAL_ELO_FLOOR}.`,
          ],
        );
      }

      if (
        loserPlacementFloorAdjustment >
        0
      ) {
        await client.query(
          `
          INSERT INTO elo_events (
            user_id,
            match_id,
            challenge_id,
            event_type,
            elo_before,
            elo_change,
            elo_after,
            description
          )

          VALUES (
            $1,
            $2,
            $3,
            'placement_completed',
            $4,
            $5,
            $6,
            $7
          )
          `,
          [
            loserId,
            match.id,
            match.challenge_id,
            loserAfterMatch,
            loserPlacementFloorAdjustment,
            loserFinalRating,

            `Finalización de colocación tras partido #${match.id}. Se aplicó piso oficial de Elo ${OFFICIAL_ELO_FLOOR}.`,
          ],
        );
      }

      /*
        AUDITORÍA
      */

      await client.query(
        `
        INSERT INTO audit_events (
          user_id,
          match_id,
          challenge_id,
          event_type,
          details
        )

        VALUES (
          $1,
          $2,
          $3,
          'match_result_confirmed',
          $4
        )
        `,
        [
          req.userId,
          match.id,
          match.challenge_id,

          JSON.stringify({
            winner_id:
              winnerId,

            loser_id:
              loserId,

            score:
              proposedScore,

            winner: {
              elo_before:
                winnerRating,

              elo_change:
                realWinnerDelta,

              elo_after:
                winnerAfterMatch,

              final_elo_after:
                winnerFinalRating,

              placement_floor_adjustment:
                winnerPlacementFloorAdjustment,

              matches_before:
                winnerMatchesPlayed,

              matches_after:
                winnerMatchesAfter,

              provisional_before:
                winnerProvisional,

              completed_placement:
                winnerCompletedPlacement,

              official_position_before:
                winnerRankBefore,

              calculation:
                winnerCalculationType,
            },

            loser: {
              elo_before:
                loserRating,

              elo_change:
                realLoserDelta,

              elo_after:
                loserAfterMatch,

              final_elo_after:
                loserFinalRating,

              placement_floor_adjustment:
                loserPlacementFloorAdjustment,

              matches_before:
                loserMatchesPlayed,

              matches_after:
                loserMatchesAfter,

              provisional_before:
                loserProvisional,

              completed_placement:
                loserCompletedPlacement,

              official_position_before:
                loserRankBefore,

              calculation:
                loserCalculationType,
            },

            special_provisional_penalty:
              specialProvisionalPenalty,

            number_one_dethrone: {
              applied:
                dethroneApplied,

              loser_was_number_one:
                loserRankBefore === 1,

              number_two_id:
                numberTwoBefore
                  ?.id || null,

              number_two_rating_before:
                numberTwoBefore
                  ?.rating || null,

              ceiling:
                dethroneCeiling,
            },
          }),
        ],
      );

      /*
        ANTIFRAUDE
      */

      await checkFrequentOpponents(
        client,
        {
          matchId:
            match.id,

          player1Id:
            match.player1_id,

          player2Id:
            match.player2_id,
        },
      );

      await checkEloConcentration(
        client,
        {
          matchId:
            match.id,

          playerId:
            winnerId,
        },
      );

      await client.query(
        "COMMIT",
      );

      res.json({
        message:
          "Resultado confirmado y ranking actualizado",

        elo_change: {
          winner:
            realWinnerDelta,

          loser:
            realLoserDelta,
        },

        rating_after: {
          winner:
            winnerFinalRating,

          loser:
            loserFinalRating,
        },

        placement: {
          winner: {
            was_provisional:
              winnerProvisional,

            matches:
              winnerMatchesAfter,

            completed:
              winnerCompletedPlacement,

            floor_adjustment:
              winnerPlacementFloorAdjustment,
          },

          loser: {
            was_provisional:
              loserProvisional,

            matches:
              loserMatchesAfter,

            completed:
              loserCompletedPlacement,

            floor_adjustment:
              loserPlacementFloorAdjustment,
          },
        },

        special_rules: {
          ranked_loss_to_provisional:
            specialProvisionalPenalty !==
            null,

          provisional_penalty:
            specialProvisionalPenalty,

          number_one_dethroned:
            dethroneApplied,

          dethrone_ceiling:
            dethroneCeiling,
        },

        rotation_unlocked:
          true,
      });
    } catch (error) {
      try {
        await client.query(
          "ROLLBACK",
        );
      } catch {
        // conexión liberada abajo
      }

      next(error);
    } finally {
      client.release();
    }
  };