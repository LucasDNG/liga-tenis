import { pool } from "../db.js";

import {
  LEAGUE_CITY,
  LEAGUES,
} from "../constants/league.js";

import {
  PLACEMENT_MATCHES,
  createEmptySportStats,
  formatRankingPlayerName,
  getLeagueSportStats,
  getOfficialRanking,
} from "../services/rankingOrder.service.js";


/*
  ============================================================
  VALIDAR LIGA
  ============================================================
*/

const getLeague = (req) => {
  const gender =
    req.query.gender ||
    "male";

  return LEAGUES.includes(
    gender,
  )
    ? gender
    : null;
};


/*
  ============================================================
  NORMALIZAR JUGADOR PARA RESPUESTA
  ============================================================
*/

const normalizePlayerResponse = (
  player,
) => ({
  ...player,

  id:
    Number(
      player.id,
    ),

  rating:
    Number(
      player.rating,
    ),

  matches_played:
    Number(
      player.matches_played,
    ),

  wins:
    Number(
      player.wins ?? 0,
    ),

  losses:
    Number(
      player.losses ?? 0,
    ),

  match_balance:
    Number(
      player.match_balance ?? 0,
    ),

  games_won:
    Number(
      player.games_won ?? 0,
    ),

  games_lost:
    Number(
      player.games_lost ?? 0,
    ),

  game_balance:
    Number(
      player.game_balance ?? 0,
    ),

  rank_position:
    player.rank_position === null ||
    player.rank_position === undefined
      ? null
      : Number(
          player.rank_position,
        ),

  provisional:
    Boolean(
      player.provisional,
    ),

  display_name:
    formatRankingPlayerName(
      player,
    ),
});


/*
  ============================================================
  RANKING ACTUAL
  ============================================================

  OFICIALES:

  1. Elo DESC
  2. victorias - derrotas DESC
  3. games ganados - games perdidos DESC
  4. apellido ASC
  5. nombre ASC
  6. ID ASC

  PROVISIONALES:

  - visibles desde la verificación;
  - no consumen puesto oficial;
  - conservan estadísticas deportivas;
  - todavía no reciben placement porcentual.
  ============================================================
*/

export const getRanking = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const gender =
      getLeague(req);

    if (!gender) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    /*
      ========================================================
      RANKING OFICIAL
      ========================================================
    */

    const officialRanking =
      await getOfficialRanking(
        client,
        {
          city:
            LEAGUE_CITY,

          gender,
        },
      );

    const officialPlayers =
      officialRanking.map(
        (player) =>
          normalizePlayerResponse({
            ...player,

            provisional:
              false,

            rank_position:
              player.official_position,
          }),
      );


    /*
      ========================================================
      PROVISIONALES
      ========================================================
    */

    const [
      provisionalResult,
      statsById,
    ] =
      await Promise.all([
        client.query(
          `
          SELECT
            id,
            name,
            first_name,
            last_name,
            gender,
            rating,
            matches_played

          FROM users

          WHERE
            city = $1

            AND gender = $2

            AND role = 'player'

            AND verification_status =
              'verified'

            AND matches_played < $3

          ORDER BY
            id ASC
          `,
          [
            LEAGUE_CITY,
            gender,
            PLACEMENT_MATCHES,
          ],
        ),

        getLeagueSportStats(
          client,
          {
            city:
              LEAGUE_CITY,

            gender,
          },
        ),
      ]);

    const provisionalPlayers =
      provisionalResult.rows
        .map(
          (player) => {
            const id =
              Number(
                player.id,
              );

            const stats =
              statsById.get(
                id,
              ) ||
              createEmptySportStats(
                id,
              );

            return normalizePlayerResponse({
              ...player,

              id,

              provisional:
                true,

              rank_position:
                null,

              wins:
                stats.wins,

              losses:
                stats.losses,

              match_balance:
                stats.match_balance,

              games_won:
                stats.games_won,

              games_lost:
                stats.games_lost,

              game_balance:
                stats.game_balance,
            });
          },
        )
        .sort(
          (a, b) => {
            /*
              Los provisionales todavía no tienen
              una posición competitiva definitiva
              del nuevo sistema.

              Esta lista pública se ordena solamente
              para presentación:

              1. más nivelatorios jugados;
              2. apellido;
              3. nombre;
              4. ID.

              NO representa ranking oficial.
            */

            const matchesDifference =
              Number(
                b.matches_played,
              ) -
              Number(
                a.matches_played,
              );

            if (
              matchesDifference !== 0
            ) {
              return matchesDifference;
            }

            const lastNameComparison =
              String(
                a.last_name ?? "",
              ).localeCompare(
                String(
                  b.last_name ?? "",
                ),
                "es",
                {
                  sensitivity:
                    "base",
                },
              );

            if (
              lastNameComparison !== 0
            ) {
              return lastNameComparison;
            }

            const firstNameComparison =
              String(
                a.first_name ?? "",
              ).localeCompare(
                String(
                  b.first_name ?? "",
                ),
                "es",
                {
                  sensitivity:
                    "base",
                },
              );

            if (
              firstNameComparison !== 0
            ) {
              return firstNameComparison;
            }

            return (
              Number(a.id) -
              Number(b.id)
            );
          },
        );


    /*
      ========================================================
      RESPUESTA
      ========================================================
    */

    res.json({
      league:
        gender,

      city:
        LEAGUE_CITY,

      placement_matches:
        PLACEMENT_MATCHES,

      ranking_order: [
        "rating",
        "match_balance",
        "game_balance",
        "last_name",
        "first_name",
        "id",
      ],

      official_players:
        officialPlayers,

      provisional_players:
        provisionalPlayers,

      players: [
        ...officialPlayers,
        ...provisionalPlayers,
      ],
    });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};


/*
  ============================================================
  TOP 3 ELO HISTÓRICO
  ============================================================

  Se conserva por ahora la regla histórica existente.

  - un récord por jugador;
  - máximo Elo válido;
  - eventos revertidos no cuentan;
  - una caída posterior no borra el récord.

  El sistema histórico será auditado nuevamente cuando
  adaptemos replay al nuevo placement.
  ============================================================
*/

export const getHistoricalElo = async (
  req,
  res,
  next,
) => {
  try {
    const gender =
      getLeague(req);

    if (!gender) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    const result =
      await pool.query(
        `
        WITH eligible_players AS (
          SELECT
            id,
            name,
            first_name,
            last_name,
            gender,
            rating,
            matches_played

          FROM users

          WHERE
            city = $1

            AND gender = $2

            AND role = 'player'

            AND verification_status =
              'verified'
        ),

        event_peaks AS (
          SELECT DISTINCT ON (
            ee.user_id
          )
            ee.user_id,

            ee.elo_after
              AS peak_elo,

            ee.created_at
              AS peak_reached_at,

            ee.id
              AS peak_event_id

          FROM elo_events ee

          JOIN eligible_players ep
            ON ep.id =
               ee.user_id

          WHERE
            ee.reversed_at IS NULL

          ORDER BY
            ee.user_id,
            ee.elo_after DESC,
            ee.created_at ASC,
            ee.id ASC
        ),

        personal_peaks AS (
          SELECT
            ep.id,
            ep.name,
            ep.first_name,
            ep.last_name,
            ep.gender,

            ep.rating
              AS current_elo,

            ep.matches_played,

            CASE
              WHEN ev.peak_elo IS NULL
                THEN ep.rating

              WHEN ep.rating >
                   ev.peak_elo
                THEN ep.rating

              ELSE ev.peak_elo
            END::int
              AS peak_elo,

            CASE
              WHEN ev.peak_elo IS NULL
                THEN NULL

              WHEN ep.rating >
                   ev.peak_elo
                THEN NULL

              ELSE ev.peak_reached_at
            END
              AS peak_reached_at

          FROM eligible_players ep

          LEFT JOIN event_peaks ev
            ON ev.user_id =
               ep.id
        )

        SELECT
          id,
          name,
          first_name,
          last_name,
          gender,
          current_elo,
          matches_played,
          peak_elo,
          peak_reached_at,

          ROW_NUMBER() OVER (
            ORDER BY
              peak_elo DESC,
              last_name ASC,
              first_name ASC,
              id ASC
          )::int
            AS historical_position

        FROM personal_peaks

        ORDER BY
          peak_elo DESC,
          last_name ASC,
          first_name ASC,
          id ASC

        LIMIT 3
        `,
        [
          LEAGUE_CITY,
          gender,
        ],
      );

    const records =
      result.rows.map(
        (record) => ({
          ...record,

          id:
            Number(
              record.id,
            ),

          current_elo:
            Number(
              record.current_elo,
            ),

          matches_played:
            Number(
              record.matches_played,
            ),

          peak_elo:
            Number(
              record.peak_elo,
            ),

          historical_position:
            Number(
              record.historical_position,
            ),

          display_name:
            formatRankingPlayerName(
              record,
            ),
        }),
      );

    res.json({
      league:
        gender,

      city:
        LEAGUE_CITY,

      records,
    });
  } catch (error) {
    next(error);
  }
};