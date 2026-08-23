import { pool } from "../db.js";

import {
  createMatchAuditFlag,
  checkFrequentOpponents,
  checkEloConcentration,
} from "../services/antifraud.service.js";


const PLACEMENT_MATCHES = 5;
const PLACEMENT_K = 64;
const NORMAL_K = 32;

/*
  Resultado cargado antes
  de 40 minutos desde el
  horario programado.
*/
const TOO_FAST_RESULT_MINUTES = 40;


/*
  ============================================================
  VALIDACIÓN DE SET
  ============================================================
*/

const isValidSet = (
  a,
  b,
) => {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    a < 0 ||
    b < 0
  ) {
    return false;
  }

  const max =
    Math.max(a, b);

  const min =
    Math.min(a, b);

  if (
    max === 6 &&
    min <= 4
  ) {
    return true;
  }

  if (
    max === 7 &&
    (
      min === 5 ||
      min === 6
    )
  ) {
    return true;
  }

  return false;
};


/*
  ============================================================
  VALIDAR RESULTADO
  ============================================================
*/

const parseScore = (
  score,
) => {
  if (
    !Array.isArray(score) ||
    score.length < 2 ||
    score.length > 3
  ) {
    return {
      error:
        "El partido debe tener 2 o 3 sets",
    };
  }

  let p1Sets = 0;
  let p2Sets = 0;

  for (
    let i = 0;
    i < score.length;
    i++
  ) {
    const a =
      Number(
        score[i]?.p1,
      );

    const b =
      Number(
        score[i]?.p2,
      );

    if (
      !isValidSet(
        a,
        b,
      )
    ) {
      return {
        error:
          `El Set ${i + 1} no es válido. Ejemplos: 6-4, 7-5 o 7-6.`,
      };
    }

    if (a > b) {
      p1Sets++;
    } else {
      p2Sets++;
    }
  }

  if (
    p1Sets !== 2 &&
    p2Sets !== 2
  ) {
    return {
      error:
        "El resultado no define un ganador al mejor de 3 sets",
    };
  }

  if (
    score.length === 3 &&
    (
      p1Sets === 3 ||
      p2Sets === 3
    )
  ) {
    return {
      error:
        "Si un jugador ganó los dos primeros sets no corresponde tercer set",
    };
  }

  return {
    winnerSide:
      p1Sets >
      p2Sets
        ? 1
        : 2,
  };
};


/*
  ============================================================
  FACTOR K
  ============================================================
*/

const getKFactor = (
  matchesPlayed,
) => {
  return (
    matchesPlayed <
    PLACEMENT_MATCHES
      ? PLACEMENT_K
      : NORMAL_K
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

            p1.name AS
              player1_name,

            p1.phone AS
              player1_phone,

            p2.name AS
              player2_name,

            p2.phone AS
              player2_phone,

            w.name AS
              winner_name,

            confirmer.name AS
              result_confirmed_by_name

          FROM matches m

          JOIN users p1
            ON p1.id =
               m.player1_id

          JOIN users p2
            ON p2.id =
               m.player2_id

          LEFT JOIN users w
            ON w.id =
               m.winner_id

          LEFT JOIN users confirmer
            ON confirmer.id =
               m.result_confirmed_by

          WHERE
            m.player1_id = $1

            OR

            m.player2_id = $1

          ORDER BY
            m.created_at DESC
          `,
          [
            req.userId,
          ],
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

      const {
        score,
      } = req.body;

      const parsed =
        parseScore(
          score,
        );

      if (
        parsed.error
      ) {
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


      const matchResult =
        await client.query(
          `
          SELECT *

          FROM matches

          WHERE id = $1

            AND status =
              'pending'

            AND annulled_at
              IS NULL

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


      /*
        El partido debe tener
        horario programado.
      */

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

      const now =
        Date.now();


      /*
        No permitimos cargar
        un resultado antes
        del horario programado.
      */

      if (
        scheduledTime >
        now
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
        parsed.winnerSide ===
        1
          ? match.player1_id
          : match.player2_id;


      const updated =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id =
              $1,

            proposed_score =
              $2,

            result_submitted_by =
              $3,

            result_submitted_at =
              CURRENT_TIMESTAMP,

            status =
              'awaiting_confirmation'

          WHERE id = $4

          RETURNING *
          `,
          [
            winnerId,

            JSON.stringify(
              score,
            ),

            req.userId,
            match.id,
          ],
        );


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

            score,
          }),
        ],
      );


      /*
        ANTIFRAUDE

        Menos de 40 minutos
        desde el horario del partido.
      */

      const minutesSinceStart =
        Math.floor(
          (
            now -
            scheduledTime
          ) /
            60000,
        );


      if (
        minutesSinceStart >=
          0 &&
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
      await client.query(
        "ROLLBACK",
      );

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


      const result =
        await client.query(
          `
          UPDATE matches

          SET
            proposed_winner_id =
              NULL,

            proposed_score =
              NULL,

            result_submitted_by =
              NULL,

            result_submitted_at =
              NULL,

            result_rejection_count =
              result_rejection_count + 1,

            status =
              'pending'

          WHERE id = $1

            AND status =
              'awaiting_confirmation'

            AND result_submitted_by
              <> $2

            AND annulled_at
              IS NULL

            AND (
              player1_id = $2
              OR
              player2_id = $2
            )

          RETURNING *
          `,
          [
            req.params.id,
            req.userId,
          ],
        );


      if (
        !result.rowCount
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
          }),
        ],
      );


      /*
        Dos rechazos o más:
        alerta administrativa.

        createMatchAuditFlag
        evita duplicados.
      */

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
      await client.query(
        "ROLLBACK",
      );

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


      const found =
        await client.query(
          `
          SELECT
            m.*,

            u1.rating AS
              p1_rating,

            u1.matches_played AS
              p1_matches_played,

            u2.rating AS
              p2_rating,

            u2.matches_played AS
              p2_matches_played

          FROM matches m

          JOIN users u1
            ON u1.id =
               m.player1_id

          JOIN users u2
            ON u2.id =
               m.player2_id

          WHERE
            m.id = $1

            AND m.status =
              'awaiting_confirmation'

            AND m.result_submitted_by
              <> $2

            AND m.annulled_at
              IS NULL

            AND (
              m.player1_id = $2
              OR
              m.player2_id = $2
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


      const winnerId =
        match
          .proposed_winner_id;


      const loserId =
        winnerId ===
        match.player1_id
          ? match.player2_id
          : match.player1_id;


      const winnerRating =
        winnerId ===
        match.player1_id
          ? match.p1_rating
          : match.p2_rating;


      const loserRating =
        winnerId ===
        match.player1_id
          ? match.p2_rating
          : match.p1_rating;


      const winnerMatchesPlayed =
        winnerId ===
        match.player1_id
          ? match
              .p1_matches_played
          : match
              .p2_matches_played;


      const loserMatchesPlayed =
        winnerId ===
        match.player1_id
          ? match
              .p2_matches_played
          : match
              .p1_matches_played;


      const winnerK =
        getKFactor(
          winnerMatchesPlayed,
        );


      const loserK =
        getKFactor(
          loserMatchesPlayed,
        );


      /*
        Probabilidad esperada.
      */

      const expectedWinner =
        1 /
        (
          1 +
          10 **
            (
              (
                loserRating -
                winnerRating
              ) /
              400
            )
        );


      const expectedLoser =
        1 -
        expectedWinner;


      const winnerDelta =
        Math.round(
          winnerK *
            (
              1 -
              expectedWinner
            ),
        );


      const loserDelta =
        Math.round(
          loserK *
            expectedLoser,
        );


      const winnerAfter =
        winnerRating +
        winnerDelta;


      const loserAfter =
        Math.max(
          100,

          loserRating -
            loserDelta,
        );


      const realLoserDelta =
        loserRating -
        loserAfter;


      /*
        ACTUALIZAR GANADOR
      */

      await client.query(
        `
        UPDATE users

        SET
          rating = $1,

          matches_played =
            matches_played + 1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = $2
        `,
        [
          winnerAfter,
          winnerId,
        ],
      );


      /*
        ACTUALIZAR PERDEDOR
      */

      await client.query(
        `
        UPDATE users

        SET
          rating = $1,

          matches_played =
            matches_played + 1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = $2
        `,
        [
          loserAfter,
          loserId,
        ],
      );


      /*
        CERRAR PARTIDO
      */

      await client.query(
        `
        UPDATE matches

        SET
          winner_id =
            proposed_winner_id,

          score =
            proposed_score,

          status =
            'completed',

          completed_at =
            CURRENT_TIMESTAMP,

          result_confirmed_at =
            CURRENT_TIMESTAMP,

          result_confirmed_by =
            $1

        WHERE id = $2
        `,
        [
          req.userId,
          match.id,
        ],
      );


      /*
        CERRAR DESAFÍO

        Esto libera el siguiente
        rival de la rueda.
      */

      if (
        match.challenge_id
      ) {
        await client.query(
          `
          UPDATE challenges

          SET
            status =
              'completed',

            resolved_at =
              CURRENT_TIMESTAMP

          WHERE id = $1
          `,
          [
            match.challenge_id,
          ],
        );
      }


      /*
        ELO DEL GANADOR
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
          winnerDelta,
          winnerAfter,

          `Victoria en partido #${match.id}`,
        ],
      );


      /*
        ELO DEL PERDEDOR
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
          loserId,
          match.id,
          match.challenge_id,

          loserRating,
          -realLoserDelta,
          loserAfter,

          `Derrota en partido #${match.id}`,
        ],
      );


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

            winner_elo_change:
              winnerDelta,

            loser_elo_change:
              -realLoserDelta,

            score:
              match
                .proposed_score,
          }),
        ],
      );


      /*
        ======================================================
        ANTIFRAUDE
        ======================================================
      */


      /*
        1. Frecuencia de partidos
        entre estos dos jugadores.
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


      /*
        2. Concentración del Elo
        del ganador.

        Solamente tiene sentido
        comprobar el jugador que
        obtuvo Elo positivo.
      */

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
            winnerDelta,

          loser:
            -realLoserDelta,
        },

        rating_after: {
          winner:
            winnerAfter,

          loser:
            loserAfter,
        },

        placement: {
          winner:
            winnerMatchesPlayed <
            PLACEMENT_MATCHES,

          loser:
            loserMatchesPlayed <
            PLACEMENT_MATCHES,
        },

        rotation_unlocked:
          true,
      });
    } catch (error) {
      await client.query(
        "ROLLBACK",
      );

      next(error);
    } finally {
      client.release();
    }
  };