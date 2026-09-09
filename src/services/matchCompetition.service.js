import {
  getCompetitionById,
} from "./competition.service.js";

import {
  getMatchParticipants,
  validateParticipantsForTeamSize,
  assertPlayersBelongToCompetition,
} from "./matchParticipants.service.js";


export class MatchCompetitionError extends Error {
  constructor(
    message,
    reason = "match_competition_error",
    details = null,
  ) {
    super(message);

    this.name =
      "MatchCompetitionError";

    this.reason =
      reason;

    this.details =
      details;
  }
}


const assertClient = (
  client,
) => {
  if (
    !client ||
    typeof client.query !==
      "function"
  ) {
    throw new MatchCompetitionError(
      "Se requiere un cliente PostgreSQL.",
      "database_client_missing",
    );
  }
};


const positiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number,
    ) ||
    number <= 0
  ) {
    throw new MatchCompetitionError(
      `${field} debe ser un entero positivo.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return number;
};


export const getMatchCompetition =
  async (
    client,
    matchId,
    {
      forUpdate = false,
    } = {},
  ) => {
    assertClient(client);

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const lockClause =
      forUpdate
        ? "FOR UPDATE OF m"
        : "";

    const result =
      await client.query(
        `
        SELECT
          m.id AS match_id,
          m.competition_id,
          m.status,

          c.format,
          c.gender,
          c.city,
          c.name AS competition_name,
          c.team_size,
          c.placement_matches,
          c.active AS competition_active

        FROM matches m

        JOIN competitions c
          ON c.id =
            m.competition_id

        WHERE
          m.id = $1

        LIMIT 1

        ${lockClause}
        `,
        [
          normalizedMatchId,
        ],
      );

    if (
      result.rowCount === 0
    ) {
      return null;
    }

    const row =
      result.rows[0];

    return {
      match_id:
        Number(
          row.match_id,
        ),

      competition_id:
        Number(
          row.competition_id,
        ),

      status:
        row.status,

      format:
        row.format,

      gender:
        row.gender,

      city:
        row.city,

      competition_name:
        row.competition_name,

      team_size:
        Number(
          row.team_size,
        ),

      placement_matches:
        Number(
          row.placement_matches,
        ),

      competition_active:
        Boolean(
          row.competition_active,
        ),
    };
  };


export const validateMatchCompetitionParticipants =
  async (
    client,
    {
      competitionId,
      participants,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const competition =
      await getCompetitionById(
        client,
        normalizedCompetitionId,
        {
          activeOnly: true,
        },
      );

    if (!competition) {
      throw new MatchCompetitionError(
        "La competición no existe o está inactiva.",
        "competition_not_found",
        {
          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const normalizedParticipants =
      validateParticipantsForTeamSize(
        participants,
        Number(
          competition.team_size,
        ),
      );

    await assertPlayersBelongToCompetition(
      client,
      {
        competitionId:
          normalizedCompetitionId,

        participants:
          normalizedParticipants,

        teamSize:
          Number(
            competition.team_size,
          ),
      },
    );

    return {
      competition,

      participants:
        normalizedParticipants,
    };
  };


export const getValidatedMatchParticipants =
  async (
    client,
    matchId,
  ) => {
    assertClient(client);

    const normalizedMatchId =
      positiveInteger(
        matchId,
        "matchId",
      );

    const match =
      await getMatchCompetition(
        client,
        normalizedMatchId,
      );

    if (!match) {
      throw new MatchCompetitionError(
        "El partido no existe o no posee una competición válida.",
        "match_not_found",
        {
          match_id:
            normalizedMatchId,
        },
      );
    }

    const participants =
      await getMatchParticipants(
        client,
        normalizedMatchId,
      );

    const normalizedParticipants =
      validateParticipantsForTeamSize(
        participants,
        match.team_size,
      );

    return {
      match,

      participants:
        normalizedParticipants,
    };
  };


export const splitParticipantsBySide =
  (
    participants,
    teamSize,
  ) => {
    const normalized =
      validateParticipantsForTeamSize(
        participants,
        teamSize,
      );

    return {
      side1:
        normalized.filter(
          (participant) =>
            Number(
              participant.side,
            ) === 1,
        ),

      side2:
        normalized.filter(
          (participant) =>
            Number(
              participant.side,
            ) === 2,
        ),
    };
  };


export const getWinningAndLosingSides =
  (
    participants,
    teamSize,
    winningSide,
  ) => {
    const normalizedWinningSide =
      Number(
        winningSide,
      );

    if (
      normalizedWinningSide !== 1 &&
      normalizedWinningSide !== 2
    ) {
      throw new MatchCompetitionError(
        "winningSide debe ser 1 o 2.",
        "invalid_winning_side",
        {
          winning_side:
            winningSide,
        },
      );
    }

    const {
      side1,
      side2,
    } =
      splitParticipantsBySide(
        participants,
        teamSize,
      );

    return {
      winning_side:
        normalizedWinningSide,

      losing_side:
        normalizedWinningSide ===
          1
          ? 2
          : 1,

      winners:
        normalizedWinningSide ===
          1
          ? side1
          : side2,

      losers:
        normalizedWinningSide ===
          1
          ? side2
          : side1,
    };
  };


export const assertSinglesMatch =
  (
    match,
  ) => {
    if (
      match.format !==
        "singles" ||
      Number(
        match.team_size,
      ) !== 1
    ) {
      throw new MatchCompetitionError(
        "Esta operación todavía corresponde únicamente a singles.",
        "singles_required",
        {
          competition_id:
            Number(
              match.competition_id,
            ),

          format:
            match.format,

          team_size:
            Number(
              match.team_size,
            ),
        },
      );
    }

    return true;
  };


export const assertDoublesMatch =
  (
    match,
  ) => {
    if (
      match.format !==
        "doubles" ||
      Number(
        match.team_size,
      ) !== 2
    ) {
      throw new MatchCompetitionError(
        "Esta operación requiere una competición de dobles.",
        "doubles_required",
        {
          competition_id:
            Number(
              match.competition_id,
            ),

          format:
            match.format,

          team_size:
            Number(
              match.team_size,
            ),
        },
      );
    }

    return true;
  };