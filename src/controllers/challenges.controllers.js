import { pool } from "../db.js";

const formatAvailableDate = (
  value,
) => {
  if (!value) return null;

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(
    new Date(value),
  );
};

export const getChallengeAvailability =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const userResult =
        await client.query(
          `
          WITH ranked AS (
            SELECT
              id,
              name,
              gender,
              city,
              role,
              verification_status,
              rating,
              matches_played,

              ROW_NUMBER() OVER (
                PARTITION BY city, gender

                ORDER BY
                  rating DESC,
                  matches_played DESC,
                  id ASC
              )::int AS rank_position

            FROM users

            WHERE role = 'player'
              AND gender IS NOT NULL
          )

          SELECT *
          FROM ranked
          WHERE id = $1
          `,
          [
            req.userId,
          ],
        );

      if (
        !userResult.rowCount
      ) {
        return res.json({
          availability: {},
        });
      }

      const currentUser =
        userResult.rows[0];

      const playersResult =
        await client.query(
          `
          WITH ranked AS (
            SELECT
              id,
              name,
              gender,
              city,
              role,
              verification_status,
              rating,
              matches_played,

              ROW_NUMBER() OVER (
                PARTITION BY city, gender

                ORDER BY
                  rating DESC,
                  matches_played DESC,
                  id ASC
              )::int AS rank_position

            FROM users

            WHERE role = 'player'
              AND gender IS NOT NULL
          )

          SELECT *
          FROM ranked

          WHERE city = $1
            AND gender = $2

          ORDER BY rank_position ASC
          `,
          [
            currentUser.city,
            currentUser.gender,
          ],
        );

      /*
        Consultamos desafíos activos
        una sola vez.

        Antes se hacía una query por
        cada jugador del ranking.
      */
      const activeChallengesResult =
        await client.query(
          `
          SELECT
            id,
            challenger_id,
            challenged_id,
            status

          FROM challenges

          WHERE status IN (
            'pending',
            'accepted'
          )

          AND (
            challenger_id = $1
            OR challenged_id = $1
          )
          `,
          [
            currentUser.id,
          ],
        );

      const activeByOpponent =
        new Map();

      for (
        const challenge of
        activeChallengesResult.rows
      ) {
        const opponentId =
          challenge.challenger_id ===
          currentUser.id
            ? challenge.challenged_id
            : challenge.challenger_id;

        activeByOpponent.set(
          opponentId,
          challenge,
        );
      }

      /*
        Traemos de una sola vez
        todos los rechazos hechos
        contra desafíos enviados
        por el usuario actual.
      */
      const cooldownsResult =
        await client.query(
          `
          SELECT DISTINCT ON (
            challenged_id
          )
            challenged_id,
            rejected_at,

            rejected_at +
              INTERVAL '7 days'
              AS available_at

          FROM challenges

          WHERE challenger_id = $1
            AND status = 'rejected'
            AND rejected_at IS NOT NULL

          ORDER BY
            challenged_id,
            rejected_at DESC
          `,
          [
            currentUser.id,
          ],
        );

      const cooldownByOpponent =
        new Map();

      for (
        const cooldown of
        cooldownsResult.rows
      ) {
        cooldownByOpponent.set(
          cooldown.challenged_id,
          cooldown,
        );
      }

      /*
        Último desafío resuelto por rival
        para aplicar la regla de rotación.
      */
      const lastResolvedResult =
        await client.query(
          `
          SELECT DISTINCT ON (
            challenged_id
          )
            challenged_id,
            resolved_at

          FROM challenges

          WHERE challenger_id = $1
            AND resolved_at IS NOT NULL

          ORDER BY
            challenged_id,
            resolved_at DESC
          `,
          [
            currentUser.id,
          ],
        );

      const lastResolvedByOpponent =
        new Map();

      for (
        const row of
        lastResolvedResult.rows
      ) {
        lastResolvedByOpponent.set(
          row.challenged_id,
          row.resolved_at,
        );
      }

      const availability = {};

      for (
        const player of
        playersResult.rows
      ) {
        if (
          player.id ===
          currentUser.id
        ) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "self",

            message:
              "Este sos vos.",
          };

          continue;
        }

        if (
          currentUser
            .verification_status !==
          "verified"
        ) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "not_verified",

            message:
              "Tu identidad tiene que estar verificada antes de poder desafiar jugadores.",
          };

          continue;
        }

        if (
          player
            .verification_status !==
          "verified"
        ) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "opponent_not_verified",

            message:
              "Este jugador todavía no está habilitado para competir.",
          };

          continue;
        }

        const difference =
          currentUser.rank_position -
          player.rank_position;

        if (
          difference < 1
        ) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "not_above",

            message:
              "Solo podés desafiar jugadores que estén por encima tuyo en el ranking.",
          };

          continue;
        }

        if (
          difference > 3
        ) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "ranking_distance",

            message:
              "Solo podés desafiar hasta 3 posiciones por encima.",
          };

          continue;
        }

        const active =
          activeByOpponent.get(
            player.id,
          );

        if (active) {
          availability[
            player.id
          ] = {
            can_challenge:
              false,

            reason:
              "active_challenge",

            message:
              active.status ===
              "accepted"
                ? "Ya tienen un partido confirmado pendiente."
                : "Ya existe un desafío pendiente entre ustedes.",
          };

          continue;
        }

        const cooldown =
          cooldownByOpponent.get(
            player.id,
          );

        if (cooldown) {
          const availableAt =
            new Date(
              cooldown.available_at,
            );

          if (
            availableAt.getTime() >
            Date.now()
          ) {
            availability[
              player.id
            ] = {
              can_challenge:
                false,

              reason:
                "rejection_cooldown",

              available_at:
                cooldown.available_at,

              message:
                `Este jugador rechazó tu último desafío. Podés volver a desafiarlo el ${formatAvailableDate(
                  cooldown.available_at,
                )}.`,
            };

            continue;
          }
        }

        const lastResolved =
          lastResolvedByOpponent.get(
            player.id,
          );

        if (lastResolved) {
          const waiting =
            await client.query(
              `
              SELECT
                c.id

              FROM challenges c

              WHERE
                c.challenged_id = $1

                AND c.challenger_id <> $2

                AND c.status =
                  'pending'

                AND c.created_at <= $3

              ORDER BY
                c.historical_meetings_at_creation ASC,
                c.created_at ASC,
                c.id ASC

              LIMIT 1
              `,
              [
                player.id,
                currentUser.id,
                lastResolved,
              ],
            );

          if (
            waiting.rowCount
          ) {
            availability[
              player.id
            ] = {
              can_challenge:
                false,

              reason:
                "rotation_wait",

              message:
                `${player.name} todavía tiene rivales anteriores esperando en su rueda. Podrás volver a desafiarlo cuando avance esa vuelta.`,
            };

            continue;
          }
        }

        availability[
          player.id
        ] = {
          can_challenge:
            true,

          reason: null,

          message:
            "Podés desafiar a este jugador.",
        };
      }

      res.json({
        availability,
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  };