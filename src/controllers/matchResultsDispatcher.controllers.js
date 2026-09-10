import {
  pool,
} from "../db.js";

import {
  submitMatchResult as submitSinglesMatchResult,
  confirmMatchResult as confirmSinglesMatchResult,
  rejectMatchResult as rejectSinglesMatchResult,
} from "./matches.controllers.js";

import {
  submitDoublesMatchResult,
  confirmDoublesMatchResult,
  rejectDoublesMatchResult,
} from "./doublesMatches.controllers.js";


const positiveInteger = (
  value,
) => {
  const number =
    Number(value);

  return (
    Number.isInteger(number) &&
    number > 0
  )
    ? number
    : null;
};


const resolveMatchFormat =
  async (
    matchId,
  ) => {
    const normalizedMatchId =
      positiveInteger(
        matchId,
      );

    if (
      !normalizedMatchId
    ) {
      return null;
    }

    const result =
      await pool.query(
        `
        SELECT
          m.id,
          m.competition_id,

          c.format,
          c.team_size

        FROM matches m

        JOIN competitions c
          ON c.id =
            m.competition_id

        WHERE
          m.id = $1

          AND m.annulled_at
            IS NULL

        LIMIT 1
        `,
        [
          normalizedMatchId,
        ],
      );

    if (
      result.rowCount !==
      1
    ) {
      return null;
    }

    return {
      id:
        Number(
          result.rows[0].id,
        ),

      competition_id:
        Number(
          result.rows[0]
            .competition_id,
        ),

      format:
        result.rows[0]
          .format,

      team_size:
        Number(
          result.rows[0]
            .team_size,
        ),
    };
  };


const dispatch = ({
  singlesHandler,
  doublesHandler,
}) =>
  async (
    req,
    res,
    next,
  ) => {
    try {
      const match =
        await resolveMatchFormat(
          req.params.id,
        );

      if (!match) {
        return res
          .status(404)
          .json({
            message:
              "Partido no encontrado.",

            reason:
              "match_not_found",
          });
      }

      if (
        match.format ===
          "doubles" &&
        match.team_size ===
          2
      ) {
        return doublesHandler(
          req,
          res,
          next,
        );
      }

      if (
        match.format ===
          "singles" &&
        match.team_size ===
          1
      ) {
        return singlesHandler(
          req,
          res,
          next,
        );
      }

      return res
        .status(409)
        .json({
          message:
            "La modalidad del partido no es válida.",

          reason:
            "invalid_match_competition",

          competition: {
            id:
              match
                .competition_id,

            format:
              match.format,

            team_size:
              match.team_size,
          },
        });
    } catch (error) {
      return next(
        error,
      );
    }
  };


export const submitMatchResult =
  dispatch({
    singlesHandler:
      submitSinglesMatchResult,

    doublesHandler:
      submitDoublesMatchResult,
  });


export const confirmMatchResult =
  dispatch({
    singlesHandler:
      confirmSinglesMatchResult,

    doublesHandler:
      confirmDoublesMatchResult,
  });


export const rejectMatchResult =
  dispatch({
    singlesHandler:
      rejectSinglesMatchResult,

    doublesHandler:
      rejectDoublesMatchResult,
  });


export default {
  submitMatchResult,
  confirmMatchResult,
  rejectMatchResult,
};