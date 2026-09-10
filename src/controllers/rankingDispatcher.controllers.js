import {
  getRanking as getSinglesRanking,
  getHistoricalElo as getSinglesHistoricalElo,
  getOfficialRankingOnly as getSinglesOfficialRankingOnly,
} from "./ranking.controllers.js";

import {
  getDoublesRanking,
  getHistoricalDoublesElo,
  getOfficialDoublesRankingOnly,
} from "./doublesRanking.controllers.js";


const normalizeFormat = (
  value,
) =>
  String(
    value ??
    "singles",
  )
    .trim()
    .toLowerCase();


const dispatchRanking = ({
  singlesHandler,
  doublesHandler,
}) =>
  (
    req,
    res,
    next,
  ) => {
    const format =
      normalizeFormat(
        req.query?.format,
      );

    if (
      format ===
      "doubles"
    ) {
      return doublesHandler(
        req,
        res,
        next,
      );
    }

    if (
      format ===
      "singles"
    ) {
      return singlesHandler(
        req,
        res,
        next,
      );
    }

    return res
      .status(400)
      .json({
        message:
          "Formato de competición inválido.",

        reason:
          "invalid_competition_format",

        allowed: [
          "singles",
          "doubles",
        ],
      });
  };


export const getRanking =
  dispatchRanking({
    singlesHandler:
      getSinglesRanking,

    doublesHandler:
      getDoublesRanking,
  });


export const getOfficialRankingOnly =
  dispatchRanking({
    singlesHandler:
      getSinglesOfficialRankingOnly,

    doublesHandler:
      getOfficialDoublesRankingOnly,
  });


export const getHistoricalElo =
  dispatchRanking({
    singlesHandler:
      getSinglesHistoricalElo,

    doublesHandler:
      getHistoricalDoublesElo,
  });


export default {
  getRanking,
  getOfficialRankingOnly,
  getHistoricalElo,
};