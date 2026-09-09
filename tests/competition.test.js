import test from "node:test";
import assert from "node:assert/strict";

import {
  CompetitionServiceError,
  normalizeCompetitionFormat,
  normalizeCompetitionGender,
  getExpectedTeamSize,
  isCompetitionShapeValid,
  isPlayerProvisionalInCompetition,
  getCompetitionById,
  resolveCompetitionForPlayer,
  getPlayerCompetitionState,
} from "../src/services/competition.service.js";

import {
  MatchParticipantsError,
  buildSinglesParticipants,
  buildDoublesParticipants,
  validateParticipantsForTeamSize,
} from "../src/services/matchParticipants.service.js";


const createQueuedClient = (
  responses = [],
) => {
  const queue =
    [...responses];

  const calls =
    [];

  return {
    calls,

    async query(
      sql,
      params = [],
    ) {
      calls.push({
        sql:
          String(sql),

        params,
      });

      if (
        queue.length === 0
      ) {
        throw new Error(
          `Mock PostgreSQL sin respuesta para query #${calls.length}.`,
        );
      }

      const next =
        queue.shift();

      if (
        next instanceof Error
      ) {
        throw next;
      }

      return next;
    },
  };
};


const competition = ({
  id = 1,
  format = "singles",
  gender = "male",
  city = "San Pedro",
  teamSize =
    format === "doubles"
      ? 2
      : 1,
  placementMatches = 5,
  active = true,
} = {}) => ({
  id,
  format,
  gender,
  city,
  name:
    `${format} ${gender} ${city}`,
  team_size:
    teamSize,
  placement_matches:
    placementMatches,
  active,
  created_at:
    "2026-09-09T00:00:00.000Z",
  updated_at:
    "2026-09-09T00:00:00.000Z",
});


test(
  "acepta singles como formato",
  () => {
    assert.equal(
      normalizeCompetitionFormat(
        "singles",
      ),
      "singles",
    );
  },
);


test(
  "acepta doubles como formato",
  () => {
    assert.equal(
      normalizeCompetitionFormat(
        "DOUBLES",
      ),
      "doubles",
    );
  },
);


test(
  "rechaza formato ajeno al tenis configurado",
  () => {
    assert.throws(
      () =>
        normalizeCompetitionFormat(
          "padel",
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionServiceError,
        );

        assert.equal(
          error.reason,
          "invalid_competition_format",
        );

        return true;
      },
    );
  },
);


test(
  "género permitido male",
  () => {
    assert.equal(
      normalizeCompetitionGender(
        "male",
      ),
      "male",
    );
  },
);


test(
  "género permitido female",
  () => {
    assert.equal(
      normalizeCompetitionGender(
        "female",
      ),
      "female",
    );
  },
);


test(
  "rechaza mixed mientras no exista esa modalidad",
  () => {
    assert.throws(
      () =>
        normalizeCompetitionGender(
          "mixed",
        ),
      CompetitionServiceError,
    );
  },
);


test(
  "singles requiere un jugador por lado",
  () => {
    assert.equal(
      getExpectedTeamSize(
        "singles",
      ),
      1,
    );
  },
);


test(
  "dobles requiere dos jugadores por lado",
  () => {
    assert.equal(
      getExpectedTeamSize(
        "doubles",
      ),
      2,
    );
  },
);


test(
  "competición singles válida",
  () => {
    assert.equal(
      isCompetitionShapeValid(
        competition({
          format:
            "singles",

          teamSize:
            1,
        }),
      ),
      true,
    );
  },
);


test(
  "competición dobles válida",
  () => {
    assert.equal(
      isCompetitionShapeValid(
        competition({
          format:
            "doubles",

          teamSize:
            2,
        }),
      ),
      true,
    );
  },
);


test(
  "singles con team_size 2 es inválido",
  () => {
    assert.equal(
      isCompetitionShapeValid(
        competition({
          format:
            "singles",

          teamSize:
            2,
        }),
      ),
      false,
    );
  },
);


test(
  "0 partidos en competición es provisional",
  () => {
    assert.equal(
      isPlayerProvisionalInCompetition(
        {
          matches_played:
            0,
        },
        competition(),
      ),
      true,
    );
  },
);


test(
  "4 partidos en competición sigue provisional",
  () => {
    assert.equal(
      isPlayerProvisionalInCompetition(
        {
          matches_played:
            4,
        },
        competition(),
      ),
      true,
    );
  },
);


test(
  "5 partidos en competición ya es oficial",
  () => {
    assert.equal(
      isPlayerProvisionalInCompetition(
        {
          matches_played:
            5,
        },
        competition(),
      ),
      false,
    );
  },
);


test(
  "sin fila de stats se considera 0/5 provisional",
  () => {
    assert.equal(
      isPlayerProvisionalInCompetition(
        null,
        competition(),
      ),
      true,
    );
  },
);


test(
  "getCompetitionById devuelve competición válida",
  async () => {
    const row =
      competition({
        id:
          7,
      });

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            row,
          ],
        },
      ]);

    const result =
      await getCompetitionById(
        client,
        7,
      );

    assert.equal(
      result.id,
      7,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        7,
      ],
    );
  },
);


test(
  "resolveCompetitionForPlayer resuelve singles por usuario",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            competition({
              id:
                10,

              format:
                "singles",
            }),
          ],
        },
      ]);

    const result =
      await resolveCompetitionForPlayer(
        client,
        {
          userId:
            25,

          format:
            "singles",
        },
      );

    assert.equal(
      result.id,
      10,
    );

    assert.equal(
      result.format,
      "singles",
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        25,
        "singles",
      ],
    );
  },
);


test(
  "estado de competición usa matches_played propios",
  async () => {
    const comp =
      competition({
        id:
          8,
      });

    const stats = {
      id:
        50,

      user_id:
        20,

      competition_id:
        8,

      rating:
        1350,

      matches_played:
        3,

      wins:
        2,

      losses:
        1,

      games_won:
        20,

      games_lost:
        15,
    };

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            comp,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            stats,
          ],
        },
      ]);

    const state =
      await getPlayerCompetitionState(
        client,
        {
          userId:
            20,

          competitionId:
            8,
        },
      );

    assert.equal(
      state.rating,
      1350,
    );

    assert.equal(
      state.matches_played,
      3,
    );

    assert.equal(
      state.placement_matches_remaining,
      2,
    );

    assert.equal(
      state.provisional,
      true,
    );
  },
);


test(
  "mismo jugador puede ser oficial en singles sin afectar dobles",
  () => {
    const singles =
      competition({
        format:
          "singles",
      });

    const doubles =
      competition({
        format:
          "doubles",
      });

    const singlesStats = {
      matches_played:
        12,

      rating:
        1600,
    };

    const doublesStats = {
      matches_played:
        1,

      rating:
        0,
    };

    assert.equal(
      isPlayerProvisionalInCompetition(
        singlesStats,
        singles,
      ),
      false,
    );

    assert.equal(
      isPlayerProvisionalInCompetition(
        doublesStats,
        doubles,
      ),
      true,
    );
  },
);


test(
  "buildSinglesParticipants crea lado A contra lado B",
  () => {
    const result =
      buildSinglesParticipants({
        player1Id:
          10,

        player2Id:
          20,
      });

    assert.deepEqual(
      result,
      [
        {
          user_id:
            10,

          side:
            1,

          position:
            1,
        },

        {
          user_id:
            20,

          side:
            2,

          position:
            1,
        },
      ],
    );
  },
);


test(
  "buildDoublesParticipants crea cuatro posiciones",
  () => {
    const result =
      buildDoublesParticipants({
        side1Player1Id:
          10,

        side1Player2Id:
          11,

        side2Player1Id:
          20,

        side2Player2Id:
          21,
      });

    assert.deepEqual(
      result,
      [
        {
          user_id:
            10,

          side:
            1,

          position:
            1,
        },

        {
          user_id:
            11,

          side:
            1,

          position:
            2,
        },

        {
          user_id:
            20,

          side:
            2,

          position:
            1,
        },

        {
          user_id:
            21,

          side:
            2,

          position:
            2,
        },
      ],
    );
  },
);


test(
  "dobles rechaza jugador repetido",
  () => {
    assert.throws(
      () =>
        buildDoublesParticipants({
          side1Player1Id:
            10,

          side1Player2Id:
            11,

          side2Player1Id:
            20,

          side2Player2Id:
            10,
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            MatchParticipantsError,
        );

        assert.equal(
          error.reason,
          "duplicate_match_user",
        );

        return true;
      },
    );
  },
);


test(
  "singles rechaza posición 2",
  () => {
    assert.throws(
      () =>
        validateParticipantsForTeamSize(
          [
            {
              user_id:
                10,

              side:
                1,

              position:
                2,
            },

            {
              user_id:
                20,

              side:
                2,

              position:
                1,
            },
          ],
          1,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            MatchParticipantsError,
        );

        assert.equal(
          error.reason,
          "invalid_position_for_team_size",
        );

        return true;
      },
    );
  },
);


test(
  "dobles exige dos jugadores en cada lado",
  () => {
    assert.throws(
      () =>
        validateParticipantsForTeamSize(
          [
            {
              user_id:
                10,

              side:
                1,

              position:
                1,
            },

            {
              user_id:
                11,

              side:
                1,

              position:
                2,
            },

            {
              user_id:
                20,

              side:
                2,

              position:
                1,
            },
          ],
          2,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            MatchParticipantsError,
        );

        assert.equal(
          error.reason,
          "invalid_participant_count",
        );

        return true;
      },
    );
  },
);