import { pool } from "../db.js";

import {
  LEAGUE_CITY,
} from "../constants/league.js";

import {
  getCompetitionByIdentity,
  normalizeCompetitionFormat,
  normalizeCompetitionGender,
  CompetitionServiceError,
} from "../services/competition.service.js";

import {
  getCompetitionRanking,
  getOfficialCompetitionRanking,
  listActiveRankings,
  CompetitionRankingError,
} from "../services/competitionRanking.service.js";


/*
  ============================================================
  LA RED
  RANKINGS DE TENIS
  ============================================================

  Esta app es exclusivamente TENIS.

  Rankings independientes:

  1. singles masculino
  2. singles femenino
  3. dobles masculino
  4. dobles femenino

  Cada competición mantiene:

  - Elo propio;
  - partidos propios;
  - placement propio;
  - posición propia;
  - histórico Elo propio.

  Compatibilidad temporal:

  Si el frontend viejo no envía format:
    singles

  Si no envía gender:
    male

  De esta manera el frontend actual sigue funcionando
  mientras agregamos los selectores visuales.
  ============================================================
*/


const DEFAULT_FORMAT =
  "singles";

const DEFAULT_GENDER =
  "male";


/*
  ============================================================
  HELPERS
  ============================================================
*/


const normalizeDisplayName = (
  player,
) => {
  const lastName =
    String(
      player?.last_name ??
        "",
    ).trim();

  const firstName =
    String(
      player?.first_name ??
        "",
    ).trim();

  const full =
    [
      lastName,
      firstName,
    ]
      .filter(Boolean)
      .join(" ");

  if (full) {
    return full;
  }

  const legacyName =
    String(
      player?.name ??
        "",
    ).trim();

  return legacyName ||
    `Jugador #${player?.id ?? "?"}`;
};


const serializeCompetition = (
  competition,
) => {
  if (!competition) {
    return null;
  }

  return {
    id:
      Number(
        competition.id,
      ),

    format:
      competition.format,

    gender:
      competition.gender,

    city:
      competition.city,

    name:
      competition.name,

    team_size:
      Number(
        competition.team_size,
      ),

    placement_matches:
      Number(
        competition
          .placement_matches,
      ),

    active:
      Boolean(
        competition.active,
      ),
  };
};


const serializePlayer = (
  player,
) => ({
  ...player,

  id:
    Number(
      player.id,
    ),

  competition_id:
    Number(
      player.competition_id,
    ),

  rating:
    Number(
      player.rating ??
        0,
    ),

  matches_played:
    Number(
      player.matches_played ??
        0,
    ),

  wins:
    Number(
      player.wins ??
        0,
    ),

  losses:
    Number(
      player.losses ??
        0,
    ),

  match_balance:
    Number(
      player.match_balance ??
        (
          Number(
            player.wins ??
              0,
          ) -
          Number(
            player.losses ??
              0,
          )
        ),
    ),

  games_won:
    Number(
      player.games_won ??
        0,
    ),

  games_lost:
    Number(
      player.games_lost ??
        0,
    ),

  game_balance:
    Number(
      player.game_balance ??
        (
          Number(
            player.games_won ??
              0,
          ) -
          Number(
            player.games_lost ??
              0,
          )
        ),
    ),

  position:
    player.position ===
      null ||
    player.position ===
      undefined
      ? null
      : Number(
          player.position,
        ),

  official_position:
    player
      .official_position ===
        null ||
    player
      .official_position ===
        undefined
      ? null
      : Number(
          player
            .official_position,
        ),

  rank_position:
    player
      .official_position ===
        null ||
    player
      .official_position ===
        undefined
      ? null
      : Number(
          player
            .official_position,
        ),

  provisional:
    Boolean(
      player.provisional,
    ),

  display_name:
    normalizeDisplayName(
      player,
    ),
});


const parseRankingIdentity = (
  req,
) => {
  const rawFormat =
    req.query?.format ??
    DEFAULT_FORMAT;

  const rawGender =
    req.query?.gender ??
    DEFAULT_GENDER;

  const format =
    normalizeCompetitionFormat(
      rawFormat,
    );

  const gender =
    normalizeCompetitionGender(
      rawGender,
    );

  return {
    format,
    gender,
    city:
      LEAGUE_CITY,
  };
};


const sendRankingError = (
  error,
  res,
  next,
) => {
  if (
    error instanceof
      CompetitionServiceError
  ) {
    return res
      .status(400)
      .json({
        message:
          error.message,

        reason:
          error.reason,

        details:
          error.details,
      });
  }

  if (
    error instanceof
      CompetitionRankingError
  ) {
    return res
      .status(409)
      .json({
        message:
          error.message,

        reason:
          error.reason,

        details:
          error.details,
      });
  }

  return next(
    error,
  );
};


/*
  ============================================================
  RESOLVER COMPETICIÓN
  ============================================================
*/


const resolveRequestedCompetition =
  async (
    client,
    req,
  ) => {
    const identity =
      parseRankingIdentity(
        req,
      );

    const competition =
      await getCompetitionByIdentity(
        client,
        {
          format:
            identity.format,

          gender:
            identity.gender,

          city:
            identity.city,

          activeOnly:
            true,
        },
      );

    return {
      identity,
      competition,
    };
  };


/*
  ============================================================
  LISTAR LAS 4 COMPETICIONES
  ============================================================
*/


export const getRankingCompetitions =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const competitions =
        await listActiveRankings(
          client,
          LEAGUE_CITY,
        );

      return res.json({
        city:
          LEAGUE_CITY,

        competitions:
          competitions.map(
            serializeCompetition,
          ),
      });
    } catch (error) {
      return sendRankingError(
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
  RANKING ACTUAL
  ============================================================
*/


export const getRanking =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        identity,
        competition,
      } =
        await resolveRequestedCompetition(
          client,
          req,
        );

      if (!competition) {
        return res
          .status(404)
          .json({
            message:
              "No existe una competición activa para esa modalidad.",

            reason:
              "competition_not_found",

            requested: {
              format:
                identity.format,

              gender:
                identity.gender,

              city:
                identity.city,
            },
          });
      }

      const ranking =
        await getCompetitionRanking(
          client,
          competition.id,
        );

      const officialPlayers =
        ranking.official.map(
          serializePlayer,
        );

      const provisionalPlayers =
        ranking.provisional.map(
          serializePlayer,
        );

      return res.json({
        /*
          league se conserva por compatibilidad
          con el frontend antiguo.
        */

        league:
          competition.gender,

        city:
          competition.city,

        format:
          competition.format,

        gender:
          competition.gender,

        competition:
          serializeCompetition(
            competition,
          ),

        placement_matches:
          Number(
            competition
              .placement_matches,
          ),

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

        counts: {
          official:
            officialPlayers.length,

          provisional:
            provisionalPlayers.length,

          total:
            officialPlayers.length +
            provisionalPlayers.length,
        },
      });
    } catch (error) {
      return sendRankingError(
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
  TOP 3 ELO HISTÓRICO POR COMPETICIÓN
  ============================================================

  Ya NO usa users.rating como autoridad.

  Fuente actual:
    player_competition_stats.rating

  Fuente histórica:
    elo_events

  Todo filtrado por:
    competition_id

  Eventos revertidos:
    no cuentan.

  Si un jugador todavía no tiene evento histórico mayor
  que su Elo actual, su rating actual actúa como peak.
  ============================================================
*/


export const getHistoricalElo =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        identity,
        competition,
      } =
        await resolveRequestedCompetition(
          client,
          req,
        );

      if (!competition) {
        return res
          .status(404)
          .json({
            message:
              "No existe una competición activa para esa modalidad.",

            reason:
              "competition_not_found",

            requested: {
              format:
                identity.format,

              gender:
                identity.gender,

              city:
                identity.city,
            },
          });
      }

      const competitionId =
        Number(
          competition.id,
        );

      const result =
        await client.query(
          `
          WITH eligible_players AS (
            SELECT
              u.id,
              u.name,
              u.first_name,
              u.last_name,

              pcs.rating
                AS current_elo,

              pcs.matches_played

            FROM player_competition_stats pcs

            JOIN users u
              ON u.id =
                pcs.user_id

            WHERE
              pcs.competition_id =
                $1

              AND u.role =
                'player'

              AND u.verification_status =
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
              ee.competition_id =
                $1

              AND ee.reversed_at
                IS NULL

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
              ep.current_elo,
              ep.matches_played,

              CASE
                WHEN ev.peak_elo
                  IS NULL
                  THEN ep.current_elo

                WHEN ep.current_elo >
                  ev.peak_elo
                  THEN ep.current_elo

                ELSE ev.peak_elo
              END::int
                AS peak_elo,

              CASE
                WHEN ev.peak_elo
                  IS NULL
                  THEN NULL

                WHEN ep.current_elo >
                  ev.peak_elo
                  THEN NULL

                ELSE
                  ev.peak_reached_at
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
            current_elo,
            matches_played,
            peak_elo,
            peak_reached_at,

            ROW_NUMBER() OVER (
              ORDER BY
                peak_elo DESC,

                LOWER(
                  COALESCE(
                    last_name,
                    ''
                  )
                ) ASC,

                LOWER(
                  COALESCE(
                    first_name,
                    ''
                  )
                ) ASC,

                id ASC
            )::int
              AS historical_position

          FROM personal_peaks

          ORDER BY
            peak_elo DESC,

            LOWER(
              COALESCE(
                last_name,
                ''
              )
            ) ASC,

            LOWER(
              COALESCE(
                first_name,
                ''
              )
            ) ASC,

            id ASC

          LIMIT 3
          `,
          [
            competitionId,
          ],
        );

      const records =
        result.rows.map(
          (
            record,
          ) => ({
            ...record,

            id:
              Number(
                record.id,
              ),

            competition_id:
              competitionId,

            current_elo:
              Number(
                record
                  .current_elo ??
                  0,
              ),

            matches_played:
              Number(
                record
                  .matches_played ??
                  0,
              ),

            peak_elo:
              Number(
                record
                  .peak_elo ??
                  0,
              ),

            historical_position:
              Number(
                record
                  .historical_position,
              ),

            display_name:
              normalizeDisplayName(
                record,
              ),
          }),
        );

      return res.json({
        league:
          competition.gender,

        city:
          competition.city,

        format:
          competition.format,

        gender:
          competition.gender,

        competition:
          serializeCompetition(
            competition,
          ),

        records,
      });
    } catch (error) {
      return sendRankingError(
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
  RANKING OFICIAL SIMPLE
  ============================================================

  Endpoint útil para:
  - desafíos;
  - frontend;
  - debugging;
  - futuros widgets.

  Devuelve solamente jugadores oficiales.
  ============================================================
*/


export const getOfficialRankingOnly =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        identity,
        competition,
      } =
        await resolveRequestedCompetition(
          client,
          req,
        );

      if (!competition) {
        return res
          .status(404)
          .json({
            message:
              "No existe una competición activa para esa modalidad.",

            reason:
              "competition_not_found",

            requested: {
              format:
                identity.format,

              gender:
                identity.gender,

              city:
                identity.city,
            },
          });
      }

      const ranking =
        await getOfficialCompetitionRanking(
          client,
          competition.id,
        );

      return res.json({
        competition:
          serializeCompetition(
            competition,
          ),

        players:
          ranking.map(
            serializePlayer,
          ),
      });
    } catch (error) {
      return sendRankingError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };