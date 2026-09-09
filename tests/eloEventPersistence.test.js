import test from "node:test";
import assert from "node:assert/strict";

import {
  EloEventPersistenceError,
  normalizeEloEvent,
  insertEloEvent,
  validateMatchEloEventPlan,
  persistMatchEloEventPlan,
} from "../src/services/eloEventPersistence.service.js";


const event = ({
  userId = 1,
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

            match_id:
              params[1],

            challenge_id:
              params[2],

            event_type:
              params[3],

            elo_before:
              params[4],

            elo_change:
              params[5],

            elo_after:
              params[6],

            description:
              params[7],
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
  "insertEloEvent usa las ocho columnas esperadas",
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

    assert.deepEqual(
      client.calls[0].params,
      [
        1,
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
  },
);


test(
  "plan oficial vs oficial exige exactamente dos match_result",
  () => {
    const plan =
      validateMatchEloEventPlan({
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
  "rechaza plan con un solo match_result",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
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
  "rechaza evento perteneciente a otro partido",
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
  "acepta quinto placement con dos match_result y placement_completed",
  () => {
    const plan =
      validateMatchEloEventPlan({
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
  },
);


test(
  "rechaza placement_completed de jugador ajeno al partido",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
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
          call.params[3],
      ),
      [
        "match_result",
        "match_result",
        "placement_completed",
      ],
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