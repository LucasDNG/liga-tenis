import {
  ensureCompetitionPlayer,
  lockCompetitionPlayers,
} from "./competitionPlayer.service.js";


export class CompetitionMatchPlayerError extends Error {
  constructor(
    message,
    reason = "competition_match_player_error",
    details = null,
  ) {
    super(message);

    this.name =
      "CompetitionMatchPlayerError";

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
    throw new CompetitionMatchPlayerError(
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
    throw new CompetitionMatchPlayerError(
      `${field} inválido.`,
      "invalid_identifier",
      {
        field,
        value,
      },
    );
  }

  return number;
};


const normalizePlayer =
  (
    row,
    competition,
  ) => {
    if (!row) {
      return null;
    }

    const id =
      Number(
        row.user_id ??
          row.id,
      );

    return {
      ...row,

      id,

      user_id:
        id,

      competition_id:
        Number(
          row.competition_id ??
            competition.id,
        ),

      rating:
        Number(
          row.rating ??
            0,
        ),

      matches_played:
        Number(
          row.matches_played ??
            0,
        ),

      wins:
        Number(
          row.wins ??
            0,
        ),

      losses:
        Number(
          row.losses ??
            0,
        ),

      games_won:
        Number(
          row.games_won ??
            0,
        ),

      games_lost:
        Number(
          row.games_lost ??
            0,
        ),

      format:
        competition.format,

      gender:
        competition.gender,

      city:
        competition.city,

      placement_matches:
        Number(
          competition
            .placement_matches,
        ),

      team_size:
        Number(
          competition
            .team_size,
        ),
    };
  };


export const loadCompetitionMatchPlayers =
  async (
    client,
    {
      competition,
      userIds,
      forUpdate = true,
    },
  ) => {
    assertClient(
      client,
    );

    if (
      !competition
    ) {
      throw new CompetitionMatchPlayerError(
        "Se requiere la competición.",
        "competition_missing",
      );
    }

    const competitionId =
      positiveInteger(
        competition.id,
        "competitionId",
      );

    if (
      !Array.isArray(
        userIds,
      ) ||
      userIds.length === 0
    ) {
      throw new CompetitionMatchPlayerError(
        "Se requieren jugadores.",
        "players_missing",
      );
    }

    const normalizedUserIds =
      [
        ...new Set(
          userIds.map(
            (
              userId,
            ) =>
              positiveInteger(
                userId,
                "userId",
              ),
          ),
        ),
      ];

    /*
      Garantiza que exista la fila por competición.
      Esto es especialmente importante durante
      la transición desde users.rating.
    */

    for (
      const userId of
      normalizedUserIds
    ) {
      await ensureCompetitionPlayer(
        client,
        {
          userId,
          competitionId,
        },
      );
    }

    let rows;

    if (forUpdate) {
      rows =
        await lockCompetitionPlayers(
          client,
          {
            competitionId,
            userIds:
              normalizedUserIds,
          },
        );
    } else {
      const result =
        await client.query(
          `
          SELECT
            pcs.user_id,
            pcs.competition_id,
            pcs.rating,
            pcs.matches_played,
            pcs.wins,
            pcs.losses,
            pcs.games_won,
            pcs.games_lost,

            u.name,
            u.first_name,
            u.last_name,
            u.phone,
            u.city,
            u.gender,
            u.role,
            u.verification_status

          FROM player_competition_stats pcs

          JOIN users u
            ON u.id =
              pcs.user_id

          WHERE
            pcs.competition_id = $1

            AND pcs.user_id =
              ANY($2::int[])

          ORDER BY
            pcs.user_id ASC
          `,
          [
            competitionId,
            normalizedUserIds,
          ],
        );

      rows =
        result.rows;
    }

    if (
      !Array.isArray(
        rows,
      ) ||
      rows.length !==
        normalizedUserIds.length
    ) {
      throw new CompetitionMatchPlayerError(
        "No se pudieron cargar las estadísticas de todos los jugadores.",
        "competition_players_not_found",
        {
          competition_id:
            competitionId,

          expected:
            normalizedUserIds,

          found:
            Array.isArray(
              rows,
            )
              ? rows.map(
                  (
                    row,
                  ) =>
                    Number(
                      row.user_id ??
                        row.id,
                    ),
                )
              : [],
        },
      );
    }

    const players =
      rows.map(
        (
          row,
        ) =>
          normalizePlayer(
            row,
            competition,
          ),
      );

    for (
      const player of
      players
    ) {
      if (
        player.role !==
          "player" ||
        player
          .verification_status !==
          "verified"
      ) {
        throw new CompetitionMatchPlayerError(
          "Uno de los participantes ya no está habilitado para competir.",
          "player_not_eligible",
          {
            user_id:
              player.id,

            competition_id:
              competitionId,
          },
        );
      }

      if (
        player.gender !==
          competition.gender ||
        player.city !==
          competition.city
      ) {
        throw new CompetitionMatchPlayerError(
          "Uno de los participantes no pertenece a la ciudad o género de la competición.",
          "player_competition_identity_mismatch",
          {
            user_id:
              player.id,

            competition_id:
              competitionId,

            player_city:
              player.city,

            competition_city:
              competition.city,

            player_gender:
              player.gender,

            competition_gender:
              competition.gender,
          },
        );
      }
    }

    return players;
  };


export const getCompetitionMatchPlayer =
  (
    players,
    userId,
  ) => {
    const normalizedUserId =
      positiveInteger(
        userId,
        "userId",
      );

    const player =
      players.find(
        (
          row,
        ) =>
          Number(
            row.id,
          ) ===
          normalizedUserId,
      );

    if (!player) {
      throw new CompetitionMatchPlayerError(
        "Jugador no encontrado entre los participantes.",
        "match_player_not_found",
        {
          user_id:
            normalizedUserId,
        },
      );
    }

    return player;
  };


export default {
  loadCompetitionMatchPlayers,
  getCompetitionMatchPlayer,
};