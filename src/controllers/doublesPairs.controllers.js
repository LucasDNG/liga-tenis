import {
  pool,
} from "../db.js";

import {
  ensureCompetitionPair,
  getCompetitionPair,
  CompetitionPairError,
} from "../services/competitionPair.service.js";


const positiveInteger = (
  value,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(
      number,
    ) &&
    number > 0
  )
    ? number
    : null;
};


const rollbackQuietly = async (
  client,
) => {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // sin acción
  }
};


const normalizePair = (
  row,
) => ({
  id:
    Number(
      row.id,
    ),

  pair_id:
    Number(
      row.id,
    ),

  competition_id:
    Number(
      row.competition_id,
    ),

  player1_id:
    Number(
      row.player1_id,
    ),

  player2_id:
    Number(
      row.player2_id,
    ),

  rating:
    Number(
      row.rating,
    ),

  matches_played:
    Number(
      row.matches_played,
    ),

  wins:
    Number(
      row.wins,
    ),

  losses:
    Number(
      row.losses,
    ),

  games_won:
    Number(
      row.games_won,
    ),

  games_lost:
    Number(
      row.games_lost,
    ),

  provisional:
    Number(
      row.matches_played,
    ) <
    Number(
      row.placement_matches,
    ),

  placement_matches:
    Number(
      row.placement_matches,
    ),

  placement_matches_remaining:
    Math.max(
      0,
      Number(
        row.placement_matches,
      ) -
      Number(
        row.matches_played,
      ),
    ),

  competition: {
    id:
      Number(
        row.competition_id,
      ),

    format:
      row.competition_format,

    gender:
      row.competition_gender,

    city:
      row.competition_city,

    name:
      row.competition_name,

    team_size:
      Number(
        row.competition_team_size,
      ),

    placement_matches:
      Number(
        row.placement_matches,
      ),
  },

  player1: {
    id:
      Number(
        row.player1_id,
      ),

    first_name:
      row.player1_first_name,

    last_name:
      row.player1_last_name,

    name:
      row.player1_name,
  },

  player2: {
    id:
      Number(
        row.player2_id,
      ),

    first_name:
      row.player2_first_name,

    last_name:
      row.player2_last_name,

    name:
      row.player2_name,
  },

  name:
    `${row.player1_name} / ${row.player2_name}`,

  created_at:
    row.created_at,

  updated_at:
    row.updated_at,
});


const sendError = (
  error,
  res,
  next,
) => {
  if (
    error instanceof
      CompetitionPairError
  ) {
    return res
      .status(
        error.statusCode ??
          409,
      )
      .json({
        message:
          error.message,

        reason:
          error.reason,

        details:
          error.details ??
          null,
      });
  }

  return next(
    error,
  );
};


const loadCompetition = async (
  client,
  competitionId,
) => {
  const result =
    await client.query(
      `
      SELECT
        id,
        format,
        gender,
        city,
        name,
        team_size,
        placement_matches,
        active

      FROM competitions

      WHERE
        id = $1
      `,
      [
        competitionId,
      ],
    );

  if (
    result.rowCount !==
    1
  ) {
    return null;
  }

  return {
    ...result.rows[0],

    id:
      Number(
        result.rows[0].id,
      ),

    team_size:
      Number(
        result.rows[0]
          .team_size,
      ),

    placement_matches:
      Number(
        result.rows[0]
          .placement_matches,
      ),

    active:
      Boolean(
        result.rows[0]
          .active,
      ),
  };
};


const assertDoublesCompetition = (
  competition,
  res,
) => {
  if (
    !competition
  ) {
    res
      .status(404)
      .json({
        message:
          "Competición no encontrada.",

        reason:
          "competition_not_found",
      });

    return false;
  }

  if (
    competition.format !==
      "doubles" ||
    competition.team_size !==
      2
  ) {
    res
      .status(409)
      .json({
        message:
          "La competición seleccionada no es de dobles.",

        reason:
          "competition_not_doubles",
      });

    return false;
  }

  if (
    !competition.active
  ) {
    res
      .status(409)
      .json({
        message:
          "La competición está inactiva.",

        reason:
          "competition_inactive",
      });

    return false;
  }

  return true;
};


/*
  ============================================================
  CREAR / REUTILIZAR PAREJA
  ============================================================

  POST /api/doubles/pairs

  body:
  {
    competition_id,
    partner_user_id
  }

  La pareja:
  - se identifica por los dos jugadores;
  - A/B = B/A;
  - si ya existe, se reutiliza;
  - si no existe, se crea;
  - entra inmediatamente al sistema de ranking.
  ============================================================
*/


export const createDoublesPair =
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

      const userId =
        positiveInteger(
          req.userId,
        );

      const competitionId =
        positiveInteger(
          req.body
            ?.competition_id,
        );

      const partnerUserId =
        positiveInteger(
          req.body
            ?.partner_user_id,
        );

      if (
        !userId
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "Usuario inválido.",

            reason:
              "invalid_user_id",
          });
      }

      if (
        !competitionId
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "competition_id es obligatorio.",

            reason:
              "competition_id_required",
          });
      }

      if (
        !partnerUserId
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "partner_user_id es obligatorio.",

            reason:
              "partner_user_id_required",
          });
      }

      if (
        userId ===
        partnerUserId
      ) {
        await rollbackQuietly(
          client,
        );

        return res
          .status(400)
          .json({
            message:
              "No podés formar una pareja con vos mismo.",

            reason:
              "cannot_pair_with_self",
          });
      }

      const competition =
        await loadCompetition(
          client,
          competitionId,
        );

      if (
        !assertDoublesCompetition(
          competition,
          res,
        )
      ) {
        await rollbackQuietly(
          client,
        );

        return;
      }

      /*
        Primero comprobamos si ya existe.

        Esto es solamente para poder informar
        al frontend si fue creada o reutilizada.
      */

      const existingPair =
        await getCompetitionPair(
          client,
          {
            competitionId,
            playerAId:
              userId,
            playerBId:
              partnerUserId,
            forUpdate:
              false,
          },
        );

      const pair =
        await ensureCompetitionPair(
          client,
          {
            competitionId,
            playerAId:
              userId,
            playerBId:
              partnerUserId,
            forUpdate:
              true,
          },
        );

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
          NULL,
          NULL,
          'doubles_pair_formed',
          $2
        )
        `,
        [
          userId,

          JSON.stringify({
            competition_id:
              competitionId,

            pair_id:
              Number(
                pair.id,
              ),

            player1_id:
              Number(
                pair.player1_id,
              ),

            player2_id:
              Number(
                pair.player2_id,
              ),

            created:
              !existingPair,
          }),
        ],
      );

      await client.query(
        "COMMIT",
      );

      return res
        .status(
          existingPair
            ? 200
            : 201,
        )
        .json({
          message:
            existingPair
              ? "La pareja ya existía y fue reutilizada."
              : "Pareja creada correctamente.",

          created:
            !existingPair,

          pair: {
            id:
              Number(
                pair.id,
              ),

            competition_id:
              Number(
                pair.competition_id,
              ),

            player1_id:
              Number(
                pair.player1_id,
              ),

            player2_id:
              Number(
                pair.player2_id,
              ),

            rating:
              Number(
                pair.rating,
              ),

            matches_played:
              Number(
                pair.matches_played,
              ),

            wins:
              Number(
                pair.wins,
              ),

            losses:
              Number(
                pair.losses,
              ),

            games_won:
              Number(
                pair.games_won,
              ),

            games_lost:
              Number(
                pair.games_lost,
              ),

            provisional:
              Number(
                pair.matches_played,
              ) <
              competition
                .placement_matches,

            placement_matches:
              competition
                .placement_matches,

            placement_matches_remaining:
              Math.max(
                0,
                competition
                  .placement_matches -
                Number(
                  pair
                    .matches_played,
                ),
              ),

            competition,
          },
        });
    } catch (error) {
      await rollbackQuietly(
        client,
      );

      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


/*
  ============================================================
  MIS PAREJAS
  ============================================================

  GET /api/doubles/pairs?competition_id=123

  competition_id es opcional.

  Devuelve todas las parejas donde participa el usuario.
  ============================================================
*/


export const getMyDoublesPairs =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const userId =
        positiveInteger(
          req.userId,
        );

      if (
        !userId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Usuario inválido.",

            reason:
              "invalid_user_id",
          });
      }

      let competitionId =
        null;

      if (
        req.query
          ?.competition_id !==
          undefined
      ) {
        competitionId =
          positiveInteger(
            req.query
              .competition_id,
          );

        if (
          !competitionId
        ) {
          return res
            .status(400)
            .json({
              message:
                "competition_id inválido.",

              reason:
                "invalid_competition_id",
            });
        }
      }

      const params = [
        userId,
      ];

      let competitionFilter =
        "";

      if (
        competitionId
      ) {
        params.push(
          competitionId,
        );

        competitionFilter =
          `AND cp.competition_id = $${params.length}`;
      }

      const result =
        await pool.query(
          `
          SELECT
            cp.id,
            cp.competition_id,
            cp.player1_id,
            cp.player2_id,
            cp.rating,
            cp.matches_played,
            cp.wins,
            cp.losses,
            cp.games_won,
            cp.games_lost,
            cp.created_at,
            cp.updated_at,

            c.format
              AS competition_format,

            c.gender
              AS competition_gender,

            c.city
              AS competition_city,

            c.name
              AS competition_name,

            c.team_size
              AS competition_team_size,

            c.placement_matches,

            p1.first_name
              AS player1_first_name,

            p1.last_name
              AS player1_last_name,

            COALESCE(
              NULLIF(
                TRIM(
                  CONCAT_WS(
                    ' ',
                    p1.first_name,
                    p1.last_name
                  )
                ),
                ''
              ),
              p1.name
            )
              AS player1_name,

            p2.first_name
              AS player2_first_name,

            p2.last_name
              AS player2_last_name,

            COALESCE(
              NULLIF(
                TRIM(
                  CONCAT_WS(
                    ' ',
                    p2.first_name,
                    p2.last_name
                  )
                ),
                ''
              ),
              p2.name
            )
              AS player2_name

          FROM competition_pairs cp

          JOIN competitions c
            ON c.id =
              cp.competition_id

          JOIN users p1
            ON p1.id =
              cp.player1_id

          JOIN users p2
            ON p2.id =
              cp.player2_id

          WHERE
            (
              cp.player1_id =
                $1

              OR

              cp.player2_id =
                $1
            )

            AND c.format =
              'doubles'

            ${competitionFilter}

          ORDER BY
            c.gender ASC,
            cp.rating DESC,
            cp.matches_played DESC,
            cp.id ASC
          `,
          params,
        );

      const pairs =
        result.rows.map(
          normalizePair,
        );

      return res.json({
        pairs,

        count:
          pairs.length,
      });
    } catch (error) {
      return sendError(
        error,
        res,
        next,
      );
    }
  };


/*
  ============================================================
  COMPAÑEROS DISPONIBLES
  ============================================================

  GET /api/doubles/pairs/eligible-partners?competition_id=123

  Devuelve jugadores:
  - role player
  - verified
  - misma ciudad
  - mismo género
  - no incluye al usuario actual

  También informa si ya existe una pareja con cada uno.
  ============================================================
*/


export const getEligibleDoublesPartners =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const userId =
        positiveInteger(
          req.userId,
        );

      const competitionId =
        positiveInteger(
          req.query
            ?.competition_id,
        );

      if (
        !userId
      ) {
        return res
          .status(400)
          .json({
            message:
              "Usuario inválido.",

            reason:
              "invalid_user_id",
          });
      }

      if (
        !competitionId
      ) {
        return res
          .status(400)
          .json({
            message:
              "competition_id es obligatorio.",

            reason:
              "competition_id_required",
          });
      }

      const competitionResult =
        await pool.query(
          `
          SELECT
            id,
            format,
            gender,
            city,
            name,
            team_size,
            placement_matches,
            active

          FROM competitions

          WHERE
            id = $1
          `,
          [
            competitionId,
          ],
        );

      const competition =
        competitionResult
          .rowCount ===
          1
          ? {
              ...competitionResult
                .rows[0],

              id:
                Number(
                  competitionResult
                    .rows[0]
                    .id,
                ),

              team_size:
                Number(
                  competitionResult
                    .rows[0]
                    .team_size,
                ),

              placement_matches:
                Number(
                  competitionResult
                    .rows[0]
                    .placement_matches,
                ),

              active:
                Boolean(
                  competitionResult
                    .rows[0]
                    .active,
                ),
            }
          : null;

      if (
        !assertDoublesCompetition(
          competition,
          res,
        )
      ) {
        return;
      }

      /*
        Validamos también al usuario actual:
        no debería poder formar pareja en una categoría
        donde él mismo no sea elegible.
      */

      const currentUserResult =
        await pool.query(
          `
          SELECT
            id,
            role,
            verification_status,
            city,
            gender

          FROM users

          WHERE
            id = $1
          `,
          [
            userId,
          ],
        );

      if (
        currentUserResult
          .rowCount !==
        1
      ) {
        return res
          .status(404)
          .json({
            message:
              "Usuario no encontrado.",

            reason:
              "user_not_found",
          });
      }

      const currentUser =
        currentUserResult
          .rows[0];

      if (
        currentUser.role !==
          "player" ||
        currentUser
          .verification_status !==
          "verified" ||
        currentUser.city !==
          competition.city ||
        currentUser.gender !==
          competition.gender
      ) {
        return res
          .status(403)
          .json({
            message:
              "No pertenecés a esta competición de dobles.",

            reason:
              "user_not_eligible_for_competition",
          });
      }

      const result =
        await pool.query(
          `
          SELECT
            u.id,
            u.first_name,
            u.last_name,

            COALESCE(
              NULLIF(
                TRIM(
                  CONCAT_WS(
                    ' ',
                    u.first_name,
                    u.last_name
                  )
                ),
                ''
              ),
              u.name
            )
              AS name,

            CASE
              WHEN cp.id
                IS NULL
                THEN FALSE
              ELSE TRUE
            END
              AS pair_exists,

            cp.id
              AS pair_id,

            cp.rating
              AS pair_rating,

            cp.matches_played
              AS pair_matches_played,

            cp.wins
              AS pair_wins,

            cp.losses
              AS pair_losses

          FROM users u

          LEFT JOIN competition_pairs cp
            ON cp.competition_id =
              $1

            AND cp.player1_id =
              LEAST(
                $2,
                u.id
              )

            AND cp.player2_id =
              GREATEST(
                $2,
                u.id
              )

          WHERE
            u.id <>
              $2

            AND u.role =
              'player'

            AND u.verification_status =
              'verified'

            AND u.city =
              $3

            AND u.gender =
              $4

          ORDER BY
            LOWER(
              COALESCE(
                u.last_name,
                ''
              )
            ) ASC,

            LOWER(
              COALESCE(
                u.first_name,
                ''
              )
            ) ASC,

            u.id ASC
          `,
          [
            competitionId,
            userId,
            competition.city,
            competition.gender,
          ],
        );

      return res.json({
        competition,

        partners:
          result.rows.map(
            (
              row,
            ) => ({
              id:
                Number(
                  row.id,
                ),

              first_name:
                row.first_name,

              last_name:
                row.last_name,

              name:
                row.name,

              pair_exists:
                Boolean(
                  row.pair_exists,
                ),

              pair_id:
                row.pair_id ===
                  null
                  ? null
                  : Number(
                      row.pair_id,
                    ),

              pair_rating:
                row.pair_rating ===
                  null
                  ? null
                  : Number(
                      row.pair_rating,
                    ),

              pair_matches_played:
                row
                  .pair_matches_played ===
                  null
                  ? null
                  : Number(
                      row
                        .pair_matches_played,
                    ),

              pair_wins:
                row.pair_wins ===
                  null
                  ? null
                  : Number(
                      row.pair_wins,
                    ),

              pair_losses:
                row.pair_losses ===
                  null
                  ? null
                  : Number(
                      row.pair_losses,
                    ),
            }),
          ),
      });
    } catch (error) {
      return sendError(
        error,
        res,
        next,
      );
    }
  };