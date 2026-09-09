import {
  getCompetitionById,
} from "./competition.service.js";

import {
  ensureCompetitionPlayer,
} from "./competitionPlayer.service.js";

import {
  buildSinglesParticipants,
  insertMatchParticipants,
} from "./matchParticipants.service.js";


export class ChallengeCompetitionError extends Error {
  constructor(
    message,
    reason = "challenge_competition_error",
    details = null,
  ) {
    super(message);

    this.name =
      "ChallengeCompetitionError";

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
    typeof client.query !== "function"
  ) {
    throw new ChallengeCompetitionError(
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
    !Number.isInteger(number) ||
    number <= 0
  ) {
    throw new ChallengeCompetitionError(
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


export const getChallengeWithCompetition =
  async (
    client,
    challengeId,
    {
      forUpdate = false,
    } = {},
  ) => {
    assertClient(client);

    const normalizedChallengeId =
      positiveInteger(
        challengeId,
        "challengeId",
      );

    const lockClause =
      forUpdate
        ? "FOR UPDATE OF ch"
        : "";

    const result =
      await client.query(
        `
        SELECT
          ch.*,

          c.format,
          c.gender AS competition_gender,
          c.city AS competition_city,
          c.name AS competition_name,
          c.team_size,
          c.placement_matches,
          c.active AS competition_active

        FROM challenges ch

        JOIN competitions c
          ON c.id =
            ch.competition_id

        WHERE
          ch.id = $1

        ${lockClause}
        `,
        [
          normalizedChallengeId,
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
      ...row,

      id:
        Number(row.id),

      competition_id:
        Number(
          row.competition_id,
        ),

      challenger_id:
        Number(
          row.challenger_id,
        ),

      challenged_id:
        Number(
          row.challenged_id,
        ),

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


export const getChallengeCompetitionPlayer =
  async (
    client,
    {
      userId,
      competitionId,
      forUpdate = false,
    },
  ) => {
    assertClient(client);

    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    await ensureCompetitionPlayer(
      client,
      {
        userId:
          normalizedUserId,

        competitionId:
          normalizedCompetitionId,
      },
    );

    const lockClause =
      forUpdate
        ? "FOR UPDATE OF pcs"
        : "";

    const result =
      await client.query(
        `
        SELECT
          u.id,
          u.name,
          u.first_name,
          u.last_name,
          u.phone,
          u.city,
          u.gender,
          u.role,
          u.verification_status,

          pcs.competition_id,

          pcs.rating,
          pcs.matches_played,
          pcs.wins,
          pcs.losses,
          pcs.games_won,
          pcs.games_lost,

          c.format,
          c.team_size,
          c.placement_matches

        FROM users u

        JOIN player_competition_stats pcs
          ON pcs.user_id = u.id

        JOIN competitions c
          ON c.id =
            pcs.competition_id

        WHERE
          u.id = $1
          AND pcs.competition_id = $2

        ${lockClause}
        `,
        [
          normalizedUserId,
          normalizedCompetitionId,
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
      ...row,

      id:
        Number(row.id),

      competition_id:
        Number(
          row.competition_id,
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

      team_size:
        Number(
          row.team_size,
        ),

      placement_matches:
        Number(
          row.placement_matches,
        ),

      provisional:
        Number(
          row.matches_played,
        ) <
        Number(
          row.placement_matches,
        ),
    };
  };


export const assertChallengePlayersBelongToCompetition =
  async (
    client,
    {
      competitionId,
      challengerId,
      challengedId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengerId =
      positiveInteger(
        challengerId,
        "challengerId",
      );

    const normalizedChallengedId =
      positiveInteger(
        challengedId,
        "challengedId",
      );

    if (
      normalizedChallengerId ===
      normalizedChallengedId
    ) {
      throw new ChallengeCompetitionError(
        "Un jugador no puede desafiarse a sí mismo.",
        "same_player",
      );
    }

    const competition =
      await getCompetitionById(
        client,
        normalizedCompetitionId,
        {
          activeOnly: true,
        },
      );

    if (!competition) {
      throw new ChallengeCompetitionError(
        "La competición no existe o está inactiva.",
        "competition_not_found",
        {
          competition_id:
            normalizedCompetitionId,
        },
      );
    }

    const challenger =
      await getChallengeCompetitionPlayer(
        client,
        {
          userId:
            normalizedChallengerId,

          competitionId:
            normalizedCompetitionId,
        },
      );

    const challenged =
      await getChallengeCompetitionPlayer(
        client,
        {
          userId:
            normalizedChallengedId,

          competitionId:
            normalizedCompetitionId,
        },
      );

    if (
      !challenger ||
      !challenged
    ) {
      throw new ChallengeCompetitionError(
        "Uno de los jugadores no pertenece a la competición.",
        "player_not_in_competition",
        {
          competition_id:
            normalizedCompetitionId,

          challenger_id:
            normalizedChallengerId,

          challenged_id:
            normalizedChallengedId,
        },
      );
    }

    if (
      challenger.role !== "player" ||
      challenged.role !== "player"
    ) {
      throw new ChallengeCompetitionError(
        "Los desafíos solo pueden realizarse entre jugadores.",
        "invalid_player_role",
      );
    }

    if (
      challenger.verification_status !==
        "verified" ||
      challenged.verification_status !==
        "verified"
    ) {
      throw new ChallengeCompetitionError(
        "Ambos jugadores deben estar verificados.",
        "player_not_verified",
      );
    }

    if (
      challenger.gender !==
        competition.gender ||
      challenged.gender !==
        competition.gender
    ) {
      throw new ChallengeCompetitionError(
        "Los jugadores no corresponden al género de la competición.",
        "competition_gender_mismatch",
      );
    }

    if (
      challenger.city !==
        competition.city ||
      challenged.city !==
        competition.city
    ) {
      throw new ChallengeCompetitionError(
        "Los jugadores no corresponden a la ciudad de la competición.",
        "competition_city_mismatch",
      );
    }

    return {
      competition,
      challenger,
      challenged,
    };
  };


export const getHistoricalCompetitionMeetings =
  async (
    client,
    {
      competitionId,
      player1Id,
      player2Id,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedPlayer1Id =
      positiveInteger(
        player1Id,
        "player1Id",
      );

    const normalizedPlayer2Id =
      positiveInteger(
        player2Id,
        "player2Id",
      );

    const result =
      await client.query(
        `
        SELECT
          COUNT(DISTINCT m.id)::int
            AS total

        FROM matches m

        JOIN match_participants mp1
          ON mp1.match_id = m.id
          AND mp1.user_id = $2

        JOIN match_participants mp2
          ON mp2.match_id = m.id
          AND mp2.user_id = $3

        WHERE
          m.competition_id = $1

          AND m.status =
            'completed'

          AND m.annulled_at
            IS NULL
        `,
        [
          normalizedCompetitionId,
          normalizedPlayer1Id,
          normalizedPlayer2Id,
        ],
      );

    return Number(
      result.rows[0]?.total ??
      0,
    );
  };


export const getCompetitionRejectionCooldown =
  async (
    client,
    {
      competitionId,
      challengerId,
      challengedId,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengerId =
      positiveInteger(
        challengerId,
        "challengerId",
      );

    const normalizedChallengedId =
      positiveInteger(
        challengedId,
        "challengedId",
      );

    const result =
      await client.query(
        `
        SELECT
          rejected_at,

          rejected_at
            + INTERVAL '7 days'
            AS available_at

        FROM challenges

        WHERE
          competition_id = $1

          AND challenger_id = $2

          AND challenged_id = $3

          AND status =
            'rejected'

          AND rejected_at
            IS NOT NULL

        ORDER BY
          rejected_at DESC,
          id DESC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedChallengerId,
          normalizedChallengedId,
        ],
      );

    if (
      result.rowCount === 0
    ) {
      return null;
    }

    const row =
      result.rows[0];

    const availableAt =
      new Date(
        row.available_at,
      );

    if (
      Number.isNaN(
        availableAt.getTime(),
      ) ||
      availableAt.getTime() <=
        Date.now()
    ) {
      return null;
    }

    return {
      rejected_at:
        row.rejected_at,

      available_at:
        row.available_at,
    };
  };


export const getActiveCompetitionChallengeBetween =
  async (
    client,
    {
      competitionId,
      player1Id,
      player2Id,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedPlayer1Id =
      positiveInteger(
        player1Id,
        "player1Id",
      );

    const normalizedPlayer2Id =
      positiveInteger(
        player2Id,
        "player2Id",
      );

    const result =
      await client.query(
        `
        SELECT
          id,
          competition_id,
          challenger_id,
          challenged_id,
          status

        FROM challenges

        WHERE
          competition_id = $1

          AND status IN (
            'pending',
            'accepted'
          )

          AND (
            (
              challenger_id = $2
              AND challenged_id = $3
            )

            OR

            (
              challenger_id = $3
              AND challenged_id = $2
            )
          )

        ORDER BY
          created_at ASC,
          id ASC

        LIMIT 1
        `,
        [
          normalizedCompetitionId,
          normalizedPlayer1Id,
          normalizedPlayer2Id,
        ],
      );

    return (
      result.rows[0] ??
      null
    );
  };


export const createCompetitionChallenge =
  async (
    client,
    {
      competitionId,
      challengerId,
      challengedId,
      historicalMeetings,
    },
  ) => {
    assertClient(client);

    const normalizedCompetitionId =
      positiveInteger(
        competitionId,
        "competitionId",
      );

    const normalizedChallengerId =
      positiveInteger(
        challengerId,
        "challengerId",
      );

    const normalizedChallengedId =
      positiveInteger(
        challengedId,
        "challengedId",
      );

    const normalizedMeetings =
      Number(
        historicalMeetings ?? 0,
      );

    if (
      !Number.isInteger(
        normalizedMeetings,
      ) ||
      normalizedMeetings < 0
    ) {
      throw new ChallengeCompetitionError(
        "historicalMeetings inválido.",
        "invalid_historical_meetings",
      );
    }

    const result =
      await client.query(
        `
        INSERT INTO challenges (
          competition_id,
          challenger_id,
          challenged_id,
          status,
          historical_meetings_at_creation
        )

        VALUES (
          $1,
          $2,
          $3,
          'pending',
          $4
        )

        RETURNING *
        `,
        [
          normalizedCompetitionId,
          normalizedChallengerId,
          normalizedChallengedId,
          normalizedMeetings,
        ],
      );

    return result.rows[0];
  };


/*
  ============================================================
  ACEPTACIÓN DE SINGLES
  ============================================================

  El modelo viejo sigue usando:
    matches.player1_id
    matches.player2_id

  Lo conservamos temporalmente para compatibilidad.

  Pero además insertamos:
    match_participants

  Así el mismo partido ya queda representado con la
  arquitectura nueva de lados.

  Dobles NO entra acá.
  ============================================================
*/

export const createSinglesMatchFromChallenge =
  async (
    client,
    {
      challenge,
    },
  ) => {
    assertClient(client);

    if (
      !challenge ||
      typeof challenge !== "object"
    ) {
      throw new ChallengeCompetitionError(
        "Desafío inválido.",
        "invalid_challenge",
      );
    }

    const competitionId =
      positiveInteger(
        challenge.competition_id,
        "challenge.competition_id",
      );

    if (
      challenge.format !== "singles" ||
      Number(
        challenge.team_size,
      ) !== 1
    ) {
      throw new ChallengeCompetitionError(
        "Este flujo de aceptación corresponde únicamente a singles.",
        "singles_required",
        {
          competition_id:
            competitionId,

          format:
            challenge.format,

          team_size:
            challenge.team_size,
        },
      );
    }

    const challengerId =
      positiveInteger(
        challenge.challenger_id,
        "challenge.challenger_id",
      );

    const challengedId =
      positiveInteger(
        challenge.challenged_id,
        "challenge.challenged_id",
      );

    const existing =
      await client.query(
        `
        SELECT
          id

        FROM matches

        WHERE
          challenge_id = $1

          AND annulled_at
            IS NULL

        LIMIT 1
        `,
        [
          challenge.id,
        ],
      );

    if (
      existing.rowCount > 0
    ) {
      throw new ChallengeCompetitionError(
        "El desafío ya tiene un partido asociado.",
        "challenge_match_exists",
        {
          challenge_id:
            Number(
              challenge.id,
            ),

          match_id:
            Number(
              existing.rows[0].id,
            ),
        },
      );
    }

    const created =
      await client.query(
        `
        INSERT INTO matches (
          challenge_id,
          competition_id,
          player1_id,
          player2_id,
          status,
          venue,
          scheduled_at
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          'pending',
          $5,
          $6
        )

        RETURNING *
        `,
        [
          challenge.id,
          competitionId,
          challengerId,
          challengedId,
          challenge.venue,
          challenge.scheduled_at,
        ],
      );

    const match =
      created.rows[0];

    const participants =
      buildSinglesParticipants({
        player1Id:
          challengerId,

        player2Id:
          challengedId,
      });

    await insertMatchParticipants(
      client,
      {
        matchId:
          match.id,

        participants,
      },
    );

    return {
      match,
      participants,
    };
  };