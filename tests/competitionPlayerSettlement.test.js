import test from "node:test";
import assert from "node:assert/strict";

import {
  CompetitionPlayerError,
  lockCompetitionPlayers,
  applyCompetitionMatchStats,
} from "../src/services/competitionPlayer.service.js";


const makeClient = (
  responses = [],
) => {
  let index =
    0;

  const calls =
    [];

  return {
    calls,

    async query(
      text,
      params = [],
    ) {
      calls.push({
        text,
        params,
      });

      if (
        index >=
        responses.length
      ) {
        throw new Error(
          `Mock PostgreSQL sin respuesta configurada para query #${index + 1}`,
        );
      }

      const response =
        responses[
          index
        ];

      index += 1;

      if (
        response instanceof
        Error
      ) {
        throw response;
      }

      return {
        rows:
          response?.rows ??
          [],

        rowCount:
          response
            ?.rowCount ??
          response
            ?.rows
            ?.length ??
          0,
      };
    },
  };
};


const competitionPlayerRow = (
  {
    userId,
    rating = 1200,
    matchesPlayed = 8,
  },
) => ({
  id:
    userId,

  user_id:
    userId,

  name:
    `Jugador ${userId}`,

  first_name:
    "Jugador",

  last_name:
    String(
      userId,
    ),

  phone:
    null,

  gender:
    "male",

  city:
    "San Pedro",

  role:
    "player",

  verification_status:
    "verified",

  competition_id:
    1,

  competition_name:
    "Singles Masculino",

  format:
    "singles",

  competition_gender:
    "male",

  competition_city:
    "San Pedro",

  team_size:
    1,

  placement_matches:
    5,

  competition_active:
    true,

  rating,

  matches_played:
    matchesPlayed,

  wins:
    5,

  losses:
    3,

  games_won:
    70,

  games_lost:
    55,
});


test(
  "lockCompetitionPlayers bloquea stats por competition_id",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            competitionPlayerRow({
              userId:
                10,
            }),

            competitionPlayerRow({
              userId:
                20,
            }),
          ],
        },
      ]);

    const players =
      await lockCompetitionPlayers(
        client,
        {
          competitionId:
            1,

          userIds: [
            10,
            20,
          ],
        },
      );

    assert.equal(
      players.length,
      2,
    );

    assert.equal(
      players[0]
        .competition_id,
      1,
    );

    assert.equal(
      players[1]
        .competition_id,
      1,
    );

    assert.match(
      client.calls[0]
        .text,
      /FOR UPDATE OF pcs/i,
    );

    assert.deepEqual(
      client.calls[0]
        .params,
      [
        1,
        [
          10,
          20,
        ],
      ],
    );
  },
);


test(
  "lockCompetitionPlayers rechaza stats faltantes",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            competitionPlayerRow({
              userId:
                10,
            }),
          ],
        },
      ]);

    await assert.rejects(
      () =>
        lockCompetitionPlayers(
          client,
          {
            competitionId:
              1,

            userIds: [
              10,
              20,
            ],
          },
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionPlayerError,
        );

        assert.equal(
          error.reason,
          "competition_players_not_found",
        );

        return true;
      },
    );
  },
);


test(
  "lockCompetitionPlayers rechaza ids repetidos",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        lockCompetitionPlayers(
          client,
          {
            competitionId:
              1,

            userIds: [
              10,
              10,
            ],
          },
        ),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "duplicate_identifier",
        );

        return true;
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "applyCompetitionMatchStats incrementa victoria y games",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              user_id:
                10,

              competition_id:
                1,

              rating:
                1216,

              matches_played:
                9,

              wins:
                6,

              losses:
                3,

              games_won:
                82,

              games_lost:
                61,

              updated_at:
                new Date(),
            },
          ],
        },
      ]);

    const result =
      await applyCompetitionMatchStats(
        client,
        {
          userId:
            10,

          competitionId:
            1,

          rating:
            1216,

          won:
            true,

          gamesWon:
            12,

          gamesLost:
            6,
        },
      );

    assert.equal(
      result.rating,
      1216,
    );

    assert.equal(
      result.matches_played,
      9,
    );

    assert.equal(
      result.wins,
      6,
    );

    assert.equal(
      result.losses,
      3,
    );

    assert.deepEqual(
      client.calls[0]
        .params,
      [
        10,
        1,
        1216,
        true,
        12,
        6,
      ],
    );
  },
);


test(
  "applyCompetitionMatchStats incrementa derrota",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              user_id:
                20,

              competition_id:
                1,

              rating:
                1184,

              matches_played:
                9,

              wins:
                4,

              losses:
                5,

              games_won:
                60,

              games_lost:
                73,

              updated_at:
                new Date(),
            },
          ],
        },
      ]);

    const result =
      await applyCompetitionMatchStats(
        client,
        {
          userId:
            20,

          competitionId:
            1,

          rating:
            1184,

          won:
            false,

          gamesWon:
            6,

          gamesLost:
            12,
        },
      );

    assert.equal(
      result.losses,
      5,
    );

    assert.equal(
      client.calls[0]
        .params[3],
      false,
    );
  },
);


test(
  "applyCompetitionMatchStats exige Elo entero no negativo",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        applyCompetitionMatchStats(
          client,
          {
            userId:
              10,

            competitionId:
              1,

            rating:
              -1,

            won:
              true,

            gamesWon:
              12,

            gamesLost:
              6,
          },
        ),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "invalid_competition_stat",
        );

        return true;
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "applyCompetitionMatchStats exige won booleano",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        applyCompetitionMatchStats(
          client,
          {
            userId:
              10,

            competitionId:
              1,

            rating:
              1200,

            won:
              1,

            gamesWon:
              12,

            gamesLost:
              6,
          },
        ),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "invalid_match_result",
        );

        return true;
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "applyCompetitionMatchStats detecta fila inexistente",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
          rowCount:
            0,
        },
      ]);

    await assert.rejects(
      () =>
        applyCompetitionMatchStats(
          client,
          {
            userId:
              10,

            competitionId:
              1,

            rating:
              1200,

            won:
              true,

            gamesWon:
              12,

            gamesLost:
              6,
          },
        ),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "competition_stats_update_failed",
        );

        return true;
      },
    );
  },
);