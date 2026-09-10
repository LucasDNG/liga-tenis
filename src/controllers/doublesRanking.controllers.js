import {
  pool,
} from "../db.js";

import {
  LEAGUE_CITY,
} from "../constants/league.js";

import {
  getCompetitionByIdentity,
  normalizeCompetitionGender,
  CompetitionServiceError,
} from "../services/competition.service.js";

import {
  getDoublesPairRanking,
  getOfficialDoublesPairRanking,
  getHistoricalDoublesPairElo,
  DoublesPairRankingError,
} from "../services/doublesPairRanking.service.js";


const DEFAULT_GENDER =
  "male";


const serializeCompetition = (
  competition,
) => ({
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
});


const sendError = (
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
          error.details ??
          null,
      });
  }

  if (
    error instanceof
    DoublesPairRankingError
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


const resolveCompetition =
  async (
    client,
    req,
  ) => {
    const gender =
      normalizeCompetitionGender(
        req.query?.gender ??
        DEFAULT_GENDER,
      );

    const competition =
      await getCompetitionByIdentity(
        client,
        {
          format:
            "doubles",

          gender,

          city:
            LEAGUE_CITY,

          activeOnly:
            true,
        },
      );

    return {
      gender,
      competition,
    };
  };


const competitionNotFound = (
  res,
  gender,
) =>
  res
    .status(404)
    .json({
      message:
        "No existe una competición activa de dobles para esa categoría.",

      reason:
        "competition_not_found",

      requested: {
        format:
          "doubles",

        gender,

        city:
          LEAGUE_CITY,
      },
    });


export const getDoublesRanking =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        gender,
        competition,
      } =
        await resolveCompetition(
          client,
          req,
        );

      if (
        !competition
      ) {
        return competitionNotFound(
          res,
          gender,
        );
      }

      const ranking =
        await getDoublesPairRanking(
          client,
          competition.id,
        );

      return res.json({
        league:
          competition.gender,

        city:
          competition.city,

        format:
          "doubles",

        gender:
          competition.gender,

        entity_type:
          "pair",

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
          "player1_last_name",
          "player1_first_name",
          "player2_last_name",
          "player2_first_name",
          "pair_id",
        ],

        official_pairs:
          ranking.official,

        provisional_pairs:
          ranking.provisional,

        /*
          Alias players para que el frontend
          actual no explote mientras lo migramos.

          En doubles cada elemento representa
          una PAREJA, no un jugador.
        */

        official_players:
          ranking.official,

        provisional_players:
          ranking.provisional,

        pairs: [
          ...ranking.official,
          ...ranking.provisional,
        ],

        players: [
          ...ranking.official,
          ...ranking.provisional,
        ],

        counts: {
          official:
            ranking
              .official_count,

          provisional:
            ranking
              .provisional_count,

          total:
            ranking.total,
        },
      });
    } catch (error) {
      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


export const getOfficialDoublesRankingOnly =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        gender,
        competition,
      } =
        await resolveCompetition(
          client,
          req,
        );

      if (
        !competition
      ) {
        return competitionNotFound(
          res,
          gender,
        );
      }

      const pairs =
        await getOfficialDoublesPairRanking(
          client,
          competition.id,
        );

      return res.json({
        format:
          "doubles",

        gender:
          competition.gender,

        city:
          competition.city,

        entity_type:
          "pair",

        competition:
          serializeCompetition(
            competition,
          ),

        pairs,

        /*
          Alias temporal para consumidores
          que esperan la propiedad players.
        */

        players:
          pairs,
      });
    } catch (error) {
      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


export const getHistoricalDoublesElo =
  async (
    req,
    res,
    next,
  ) => {
    const client =
      await pool.connect();

    try {
      const {
        gender,
        competition,
      } =
        await resolveCompetition(
          client,
          req,
        );

      if (
        !competition
      ) {
        return competitionNotFound(
          res,
          gender,
        );
      }

      const records =
        await getHistoricalDoublesPairElo(
          client,
          competition.id,
          {
            limit:
              3,
          },
        );

      return res.json({
        league:
          competition.gender,

        city:
          competition.city,

        format:
          "doubles",

        gender:
          competition.gender,

        entity_type:
          "pair",

        competition:
          serializeCompetition(
            competition,
          ),

        records,
      });
    } catch (error) {
      return sendError(
        error,
        res,
        next,
      );
    } finally {
      client.release();
    }
  };


export default {
  getDoublesRanking,
  getOfficialDoublesRankingOnly,
  getHistoricalDoublesElo,
};