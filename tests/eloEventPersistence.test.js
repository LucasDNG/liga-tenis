import test from "node:test";
import assert from "node:assert/strict";

import {
  EloEventPersistenceError,
  normalizeEloEvent,
  insertEloEvent,
  validateMatchEloEventPlan,
  persistMatchEloEventPlan,
} from "../src/services/eloEventPersistence.service.js";


const COMPETITION_ID =
  3;


const event = ({
  userId = 1,
  competitionId = COMPETITION_ID,
  matchId = 100,
  challengeId = null,
  eventType = "match_result",
  before = 1500,
  change = 16,
  after = 1516,
  description = "Test",
} = {}) => ({
  user_id:
    userId,

  competition_id:
    competitionId,

  match_id:
    matchId,

  challenge_id:
    challengeId,

  event_type:
    eventType,

  elo_before:
    before,

  elo_change:
    change,

  elo_after:
    after,

  description,
});


const clientMock = () => {
  const calls =
    [];

  return {
    calls,

    async query(
      sql,
      params,
    ) {
      calls.push({
        sql,
        params,
      });

      return {
        rows: [
          {
            id:
              calls.length,

            user_id:
              params[0],

            competition_id:
              params[1],

            match_id:
              params[2],

            challenge_id:
              params[3],

            event_type:
              params[4],

            elo_before:
              params[5],

            elo_change:
              params[6],

            elo_after:
              params[7],

            description:
              params[8],
          },
        ],
      };
    },
  };
};


test(
  "normaliza evento Elo válido",
  () => {
    const normalized =
      normalizeEloEvent(
        event(),
      );

    assert.deepEqual(
      normalized,
      {
        user_id:
          1,

        competition_id:
          COMPETITION_ID,

        match_id:
          100,

        challenge_id:
          null,

        event_type:
          "match_result",

        elo_before:
          1500,

        elo_change:
          16,

        elo_after:
          1516,

        description:
          "Test",
      },
    );
  },
);


test(
  "rechaza evento sin competition_id",
  () => {
    assert.throws(
      () =>
        normalizeEloEvent(
          event({
            competitionId:
              null,
          }),
        ),
      (error) => {
        assert.ok(
          error instanceof
            EloEventPersistenceError,
        );

        assert.equal(
          error.reason,
          "invalid_positive_integer",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza evento que no cierra contablemente",
  () => {
    assert.throws(
      () =>
        normalizeEloEvent(
          event({
            before:
              1500,

            change:
              16,

            after:
              1517,
          }),
        ),
      (error) => {
        assert.ok(
          error instanceof
            EloEventPersistenceError,
        );

        assert.equal(
          error.reason,
          "elo_event_balance_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "insertEloEvent usa nueve columnas incluyendo competition_id",
  async () => {
    const client =
      clientMock();

    const inserted =
      await insertEloEvent(
        client,
        event({
          challengeId:
            77,
        }),
      );

    assert.equal(
      client.calls.length,
      1,
    );

    assert.match(
      client.calls[0].sql,
      /INSERT INTO elo_events/i,
    );

    assert.match(
      client.calls[0].sql,
      /competition_id/i,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        1,
        COMPETITION_ID,
        100,
        77,
        "match_result",
        1500,
        16,
        1516,
        "Test",
      ],
    );

    assert.equal(
      inserted.event_type,
      "match_result",
    );

    assert.equal(
      inserted.competition_id,
      COMPETITION_ID,
    );
  },
);


test(
  "plan oficial vs oficial exige exactamente dos match_result",
  () => {
    const plan =
      validateMatchEloEventPlan({
        competition_id:
          COMPETITION_ID,

        match_id:
          100,

        challenge_id:
          null,

        events: [
          event({
            userId:
              1,

            change:
              16,

            after:
              1516,
          }),

          event({
            userId:
              2,

            change:
              -16,

            after:
              1484,
          }),
        ],
      });

    assert.equal(
      plan.competition_id,
      COMPETITION_ID,
    );

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      0,
    );
  },
);


test(
  "rechaza plan sin competition_id",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          match_id:
            100,

          events: [
            event({
              userId:
                1,
            }),

            event({
              userId:
                2,

              change:
                -16,

              after:
                1484,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_positive_integer",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza plan con un solo match_result",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            100,

          events: [
            event(),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_match_result_count",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza dos match_result del mismo jugador",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            100,

          events: [
            event({
              userId:
                1,

              change:
                16,

              after:
                1516,
            }),

            event({
              userId:
                1,

              change:
                -16,

              after:
                1484,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "duplicate_match_result_user",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza evento perteneciente a otra competición",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            100,

          events: [
            event({
              userId:
                1,
            }),

            event({
              userId:
                2,

              competitionId:
                99,

              change:
                -16,

              after:
                1484,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "event_competition_id_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza evento perteneciente a otro partido",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            100,

          events: [
            event({
              userId:
                1,

              matchId:
                100,

              change:
                16,

              after:
                1516,
            }),

            event({
              userId:
                2,

              matchId:
                101,

              change:
                -16,

              after:
                1484,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "event_match_id_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza challenge_id distinto dentro del mismo plan",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            100,

          challenge_id:
            55,

          events: [
            event({
              userId:
                1,

              challengeId:
                55,
            }),

            event({
              userId:
                2,

              challengeId:
                56,

              change:
                -16,

              after:
                1484,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "event_challenge_id_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "acepta quinto placement con dos match_result y placement_completed",
  () => {
    const plan =
      validateMatchEloEventPlan({
        competition_id:
          COMPETITION_ID,

        match_id:
          200,

        challenge_id:
          50,

        events: [
          event({
            userId:
              1,

            matchId:
              200,

            challengeId:
              50,

            before:
              0,

            change:
              0,

            after:
              0,
          }),

          event({
            userId:
              2,

            matchId:
              200,

            challengeId:
              50,

            before:
              1500,

            change:
              -200,

            after:
              1300,
          }),

          event({
            userId:
              1,

            matchId:
              200,

            challengeId:
              50,

            eventType:
              "placement_completed",

            before:
              0,

            change:
              1400,

            after:
              1400,

            description:
              "Placement completo",
          }),
        ],
      });

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      1,
    );

    assert.equal(
      plan.events.length,
      3,
    );

    assert.ok(
      plan.events.every(
        (item) =>
          item.competition_id ===
          COMPETITION_ID,
      ),
    );
  },
);


test(
  "rechaza placement_completed de jugador ajeno al partido",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            COMPETITION_ID,

          match_id:
            200,

          events: [
            event({
              userId:
                1,

              matchId:
                200,

              change:
                0,

              after:
                1500,
            }),

            event({
              userId:
                2,

              matchId:
                200,

              change:
                0,

              after:
                1500,
            }),

            event({
              userId:
                3,

              matchId:
                200,

              eventType:
                "placement_completed",

              before:
                0,

              change:
                1200,

              after:
                1200,
            }),
          ],
        }),
      (error) => {
        assert.equal(
          error.reason,
          "placement_user_not_in_match",
        );

        return true;
      },
    );
  },
);


test(
  "persistMatchEloEventPlan inserta eventos en orden",
  async () => {
    const client =
      clientMock();

    const result =
      await persistMatchEloEventPlan(
        client,
        {
          competition_id:
            COMPETITION_ID,

          match_id:
            300,

          challenge_id:
            80,

          events: [
            event({
              userId:
                10,

              matchId:
                300,

              challengeId:
                80,

              before:
                1500,

              change:
                16,

              after:
                1516,

              description:
                "Victoria",
            }),

            event({
              userId:
                20,

              matchId:
                300,

              challengeId:
                80,

              before:
                1500,

              change:
                -16,

              after:
                1484,

              description:
                "Derrota",
            }),
          ],
        },
      );

    assert.equal(
      result.competition_id,
      COMPETITION_ID,
    );

    assert.equal(
      result.inserted_count,
      2,
    );

    assert.equal(
      result.match_result_count,
      2,
    );

    assert.equal(
      client.calls.length,
      2,
    );

    assert.equal(
      client.calls[0]
        .params[0],
      10,
    );

    assert.equal(
      client.calls[1]
        .params[0],
      20,
    );

    assert.equal(
      client.calls[0]
        .params[1],
      COMPETITION_ID,
    );

    assert.equal(
      client.calls[1]
        .params[1],
      COMPETITION_ID,
    );
  },
);


test(
  "persistencia de quinto placement inserta match_result antes de placement_completed",
  async () => {
    const client =
      clientMock();

    const result =
      await persistMatchEloEventPlan(
        client,
        {
          competition_id:
            COMPETITION_ID,

          match_id:
            400,

          challenge_id:
            null,

          events: [
            event({
              userId:
                10,

              matchId:
                400,

              before:
                0,

              change:
                0,

              after:
                0,

              description:
                "Nivelatorio 5/5",
            }),

            event({
              userId:
                20,

              matchId:
                400,

              before:
                1600,

              change:
                -200,

              after:
                1400,

              description:
                "Derrota",
            }),

            event({
              userId:
                10,

              matchId:
                400,

              eventType:
                "placement_completed",

              before:
                0,

              change:
                1400,

              after:
                1400,

              description:
                "Placement completo",
            }),
          ],
        },
      );

    assert.equal(
      result.inserted_count,
      3,
    );

    assert.deepEqual(
      client.calls.map(
        (call) =>
          call.params[4],
      ),
      [
        "match_result",
        "match_result",
        "placement_completed",
      ],
    );

    assert.ok(
      client.calls.every(
        (call) =>
          call.params[1] ===
          COMPETITION_ID,
      ),
    );
  },
);


test(
  "rechaza client PostgreSQL inválido",
  async () => {
    await assert.rejects(
      () =>
        insertEloEvent(
          null,
          event(),
        ),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_client",
        );

        return true;
      },
    );
  },
);