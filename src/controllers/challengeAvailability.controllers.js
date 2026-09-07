import { pool } from "../db.js";


const PLACEMENT_MATCHES = 5;


const formatAvailableDate = (
  value,
) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

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
        ======================================================
        POSICIÓN COMPETITIVA
        ======================================================

        IMPORTANTE:

        Solo participan jugadores verificados.

        Para desafíos:

        1. establecidos primero
        2. provisionales después

        Dentro de cada grupo:
        Elo DESC
        partidos DESC
        id ASC

        De esta forma un provisional puede jugar
        sus 5 partidos sin ocupar todavía una
        posición oficial del ranking.
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

              matches_played < $2
                AS provisional,

              ROW_NUMBER() OVER (
                PARTITION BY
                  city,
                  gender

                ORDER BY
                  CASE
                    WHEN matches_played >= $2
                      THEN 0
                    ELSE 1
                  END ASC,

                  rating DESC,
                  matches_played DESC,
                  id ASC
              )::int
                AS competitive_position

            FROM users

            WHERE role =
              'player'

              AND gender
                IS NOT NULL

              AND verification_status =
                'verified'
          )

          SELECT *

          FROM ranked

          WHERE id = $1
          `,
          [
            req.userId,
            PLACEMENT_MATCHES,
          ],
        );


      /*
        Si no está en la población competitiva:
        - no existe
        - no está verificado
        - no eligió liga
        - no es player
      */

      if (
        !userResult.rowCount
      ) {
        return res.json({
          availability:
            {},
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
              rating,
              matches_played,

              matches_played < $3
                AS provisional,

              ROW_NUMBER() OVER (
                PARTITION BY
                  city,
                  gender

                ORDER BY
                  CASE
                    WHEN matches_played >= $3
                      THEN 0
                    ELSE 1
                  END ASC,

                  rating DESC,
                  matches_played DESC,
                  id ASC
              )::int
                AS competitive_position

            FROM users

            WHERE role =
              'player'

              AND gender
                IS NOT NULL

              AND verification_status =
                'verified'
          )

          SELECT *

          FROM ranked

          WHERE city = $1
            AND gender = $2

          ORDER BY
            competitive_position ASC
          `,
          [
            currentUser.city,
            currentUser.gender,
            PLACEMENT_MATCHES,
          ],
        );


      /*
        ======================================================
        DESAFÍOS ACTIVOS
        ======================================================
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
          Number(
            challenge.challenger_id,
          ) ===
          Number(
            currentUser.id,
          )
            ? challenge.challenged_id
            : challenge.challenger_id;


        activeByOpponent.set(
          Number(
            opponentId,
          ),
          challenge,
        );
      }


      /*
        ======================================================
        COOLDOWN POR RECHAZO
        ======================================================
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

            AND status =
              'rejected'

            AND rejected_at
              IS NOT NULL

          ORDER BY
            challenged_id,
            rejected_at DESC,
            id DESC
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
          Number(
            cooldown.challenged_id,
          ),
          cooldown,
        );
      }


      /*
        ======================================================
        ÚLTIMO DESAFÍO RESUELTO
        ======================================================
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

            AND resolved_at
              IS NOT NULL

          ORDER BY
            challenged_id,
            resolved_at DESC,
            id DESC
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
          Number(
            row.challenged_id,
          ),
          row.resolved_at,
        );
      }


      /*
        ======================================================
        DISPONIBILIDAD
        ======================================================
      */

      const availability =
        {};


      for (
        const player of
        playersResult.rows
      ) {
        const playerId =
          Number(
            player.id,
          );


        const currentUserId =
          Number(
            currentUser.id,
          );


        if (
          playerId ===
          currentUserId
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
          Solo se puede desafiar hacia arriba
          en la posición competitiva.

          Los provisionales están debajo de
          todos los establecidos hasta terminar
          sus 5 partidos.
        */

        const difference =
          Number(
            currentUser
              .competitive_position,
          ) -
          Number(
            player
              .competitive_position,
          );


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
              "Solo podés desafiar jugadores que estén por encima tuyo.",
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
          Desafío activo.
        */

        const active =
          activeByOpponent.get(
            playerId,
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


        /*
          Cooldown.
        */

        const cooldown =
          cooldownByOpponent.get(
            playerId,
          );


        if (cooldown) {
          const availableAt =
            new Date(
              cooldown.available_at,
            );


          if (
            !Number.isNaN(
              availableAt.getTime(),
            ) &&
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
          Rotación.
        */

        const lastResolved =
          lastResolvedByOpponent.get(
            playerId,
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

          reason:
            null,

          message:
            player.provisional
              ? "Podés desafiar a este jugador provisional."
              : "Podés desafiar a este jugador.",
        };
      }


      res.json({
        placement_matches:
          PLACEMENT_MATCHES,

        current_player: {
          provisional:
            currentUser.provisional,

          matches_played:
            currentUser.matches_played,

          matches_remaining:
            Math.max(
              0,
              PLACEMENT_MATCHES -
                Number(
                  currentUser
                    .matches_played,
                ),
            ),
        },

        availability,
      });
    } catch (error) {
      next(error);
    } finally {
      client.release();
    }
  };