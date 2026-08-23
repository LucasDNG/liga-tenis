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
      /*
        =====================================================
        USUARIO ACTUAL + POSICIÓN
        =====================================================
      */

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

      /*
        Admin u otro usuario no jugador.
      */
      if (
        !userResult.rowCount
      ) {
        return res.json({
          availability: {},
        });
      }

      const currentUser =
        userResult.rows[0];

      /*
        =====================================================
        JUGADORES DE LA MISMA LIGA
        =====================================================
      */

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

      const availability = {};

      for (
        const player of
        playersResult.rows
      ) {
        /*
          ===================================================
          UNO MISMO
          ===================================================
        */

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

        /*
          ===================================================
          CUENTA PROPIA SIN VERIFICAR
          ===================================================
        */

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

        /*
          ===================================================
          RIVAL SIN VERIFICAR
          ===================================================
        */

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

        /*
          ===================================================
          DISTANCIA DEL RANKING
          ===================================================
        */

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

        /*
          ===================================================
          DESAFÍO / PARTIDO ACTIVO
          ===================================================
        */

        const activeResult =
          await client.query(
            `
            SELECT
              id,
              status

            FROM challenges

            WHERE status IN (
              'pending',
              'accepted'
            )

            AND (
              (
                challenger_id = $1
                AND challenged_id = $2
              )

              OR

              (
                challenger_id = $2
                AND challenged_id = $1
              )
            )

            LIMIT 1
            `,
            [
              currentUser.id,
              player.id,
            ],
          );

        if (
          activeResult.rowCount
        ) {
          const active =
            activeResult.rows[0];

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

        /*
          ===================================================
          COOLDOWN DE 7 DÍAS

          Importante:
          buscamos solamente cuando YO fui quien
          desafió y el rival me rechazó.
          ===================================================
        */

        const cooldownResult =
          await client.query(
            `
            SELECT
              rejected_at,

              rejected_at +
                INTERVAL '7 days'
                AS available_at

            FROM challenges

            WHERE challenger_id = $1
              AND challenged_id = $2
              AND status = 'rejected'
              AND rejected_at IS NOT NULL

            ORDER BY rejected_at DESC

            LIMIT 1
            `,
            [
              currentUser.id,
              player.id,
            ],
          );

        if (
          cooldownResult.rowCount
        ) {
          const cooldown =
            cooldownResult.rows[0];

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

        /*
          ===================================================
          RUEDA DEL JUGADOR DESAFIADO

          Si ya jugaste/resolviste con ese jugador,
          pero él tiene desafíos anteriores de otros
          rivales esperando, no podés volver a meterte
          adelante.
          ===================================================
        */

        const lastResolved =
          await client.query(
            `
            SELECT resolved_at

            FROM challenges

            WHERE challenger_id = $1
              AND challenged_id = $2
              AND resolved_at IS NOT NULL

            ORDER BY resolved_at DESC

            LIMIT 1
            `,
            [
              currentUser.id,
              player.id,
            ],
          );

        if (
          lastResolved.rowCount
        ) {
          const waiting =
            await client.query(
              `
              SELECT
                c.id,
                u.name

              FROM challenges c

              JOIN users u
                ON u.id =
                   c.challenger_id

              WHERE
                c.challenged_id = $1

                AND c.challenger_id <> $2

                AND c.status =
                  'pending'

                AND c.created_at <= $3

              ORDER BY
                c.historical_meetings_at_creation ASC,
                c.created_at ASC

              LIMIT 1
              `,
              [
                player.id,
                currentUser.id,
                lastResolved.rows[0]
                  .resolved_at,
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

        /*
          ===================================================
          HABILITADO
          ===================================================
        */

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