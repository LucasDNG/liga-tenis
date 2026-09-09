import test from "node:test";
import assert from "node:assert/strict";

import {
  EloReplayError,
  REPLAYABLE_EVENT_TYPES,
  validateReplayEventArithmetic,
  validateReplayEventRelationships,
  getUnsupportedReplayEvents,
  buildReplayChronology,
} from "../src/services/eloReplay.service.js";


const baseEvent = ({
  id = 1,
  userId = 10,
  matchId = 100,
  challengeId = null,
  eventType = "match_result",
  before = 1500,
  change = 16,
  after = 1516,
  createdAt = "2026-01-01T12:00:00.000Z",
  activityAnchorAt = null,
  inactivityMonthNumber = null,
} = {}) => ({
  id,

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

  created_at:
    createdAt,

  activity_anchor_at:
    activityAnchorAt,

  inactivity_month_number:
    inactivityMonthNumber,
});


test(
  "replay reconoce todos los tipos Elo actuales",
  () => {
    assert.equal(
      REPLAYABLE_EVENT_TYPES.has(
        "match_result",
      ),
      true,
    );

    assert.equal(
      REPLAYABLE_EVENT_TYPES.has(
        "placement_completed",
      ),
      true,
    );

    assert.equal(
      REPLAYABLE_EVENT_TYPES.has(
        "challenge_rejection",
      ),
      true,
    );

    assert.equal(
      REPLAYABLE_EVENT_TYPES.has(
        "match_cancellation",
      ),
      true,
    );

    assert.equal(
      REPLAYABLE_EVENT_TYPES.has(
        "inactivity_decay",
      ),
      true,
    );
  },
);


test(
  "aritmética Elo válida pasa",
  () => {
    assert.equal(
      validateReplayEventArithmetic([
        baseEvent(),
      ]),
      true,
    );
  },
);


test(
  "aritmética Elo inválida falla",
  () => {
    assert.throws(
      () =>
        validateReplayEventArithmetic([
          baseEvent({
            after:
              1517,
          }),
        ]),
      (error) => {
        assert.ok(
          error instanceof
            EloReplayError,
        );

        assert.equal(
          error.code,
          "invalid_elo_event_arithmetic",
        );

        return true;
      },
    );
  },
);


test(
  "Elo negativo falla",
  () => {
    assert.throws(
      () =>
        validateReplayEventArithmetic([
          baseEvent({
            before:
              0,

            change:
              -1,

            after:
              -1,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "negative_elo_event",
        );

        return true;
      },
    );
  },
);


test(
  "match_result requiere match",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            matchId:
              null,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "elo_event_without_match",
        );

        return true;
      },
    );
  },
);


test(
  "placement_completed requiere match",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            eventType:
              "placement_completed",

            matchId:
              null,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "elo_event_without_match",
        );

        return true;
      },
    );
  },
);


test(
  "challenge_rejection requiere challenge",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            eventType:
              "challenge_rejection",

            matchId:
              null,

            challengeId:
              null,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "rejection_without_challenge",
        );

        return true;
      },
    );
  },
);


test(
  "match_cancellation requiere match",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            eventType:
              "match_cancellation",

            matchId:
              null,

            change:
              -15,

            after:
              1485,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "cancellation_without_match",
        );

        return true;
      },
    );
  },
);


test(
  "match_cancellation válido pasa",
  () => {
    assert.equal(
      validateReplayEventRelationships([
        baseEvent({
          eventType:
            "match_cancellation",

          change:
            -15,

          after:
            1485,
        }),
      ]),
      true,
    );
  },
);


test(
  "inactivity_decay requiere anchor",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            eventType:
              "inactivity_decay",

            matchId:
              null,

            change:
              -10,

            after:
              1490,

            inactivityMonthNumber:
              1,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "inactivity_without_anchor",
        );

        return true;
      },
    );
  },
);


test(
  "inactivity_decay requiere mes positivo",
  () => {
    assert.throws(
      () =>
        validateReplayEventRelationships([
          baseEvent({
            eventType:
              "inactivity_decay",

            matchId:
              null,

            change:
              -10,

            after:
              1490,

            activityAnchorAt:
              "2025-12-01T00:00:00.000Z",

            inactivityMonthNumber:
              0,
          }),
        ]),
      (error) => {
        assert.equal(
          error.code,
          "invalid_inactivity_month",
        );

        return true;
      },
    );
  },
);


test(
  "inactivity_decay válido pasa",
  () => {
    assert.equal(
      validateReplayEventRelationships([
        baseEvent({
          eventType:
            "inactivity_decay",

          matchId:
            null,

          change:
            -10,

          after:
            1490,

          activityAnchorAt:
            "2025-12-01T00:00:00.000Z",

          inactivityMonthNumber:
            1,
        }),
      ]),
      true,
    );
  },
);


test(
  "detecta eventos desconocidos",
  () => {
    const unsupported =
      getUnsupportedReplayEvents([
        baseEvent(),

        baseEvent({
          id:
            2,

          eventType:
            "evento_inventado",
        }),
      ]);

    assert.equal(
      unsupported.length,
      1,
    );

    assert.equal(
      unsupported[0]
        .event_type,
      "evento_inventado",
    );
  },
);


test(
  "cronología incluye rechazo, cancelación e inactividad",
  () => {
    const chronology =
      buildReplayChronology({
        targetMatchId:
          100,

        matches: [
          {
            id:
              100,

            challenge_id:
              30,

            player1_id:
              1,

            player2_id:
              2,

            winner_id:
              1,

            completed_at:
              "2026-01-01T10:00:00.000Z",
          },

          {
            id:
              101,

            challenge_id:
              31,

            player1_id:
              1,

            player2_id:
              3,

            winner_id:
              3,

            completed_at:
              "2026-01-02T10:00:00.000Z",
          },
        ],

        events: [
          baseEvent({
            id:
              20,

            eventType:
              "challenge_rejection",

            matchId:
              null,

            challengeId:
              50,

            createdAt:
              "2026-01-01T12:00:00.000Z",
          }),

          baseEvent({
            id:
              21,

            eventType:
              "match_cancellation",

            matchId:
              90,

            challengeId:
              51,

            change:
              -15,

            after:
              1485,

            createdAt:
              "2026-01-01T13:00:00.000Z",
          }),

          baseEvent({
            id:
              22,

            eventType:
              "inactivity_decay",

            matchId:
              null,

            change:
              -10,

            after:
              1490,

            activityAnchorAt:
              "2025-12-01T00:00:00.000Z",

            inactivityMonthNumber:
              1,

            createdAt:
              "2026-01-01T14:00:00.000Z",
          }),

          baseEvent({
            id:
              23,

            eventType:
              "match_result",

            matchId:
              101,

            createdAt:
              "2026-01-02T10:00:01.000Z",
          }),
        ],
      });

    assert.deepEqual(
      chronology.map(
        (item) =>
          item.type,
      ),
      [
        "annul_target_match",
        "replay_challenge_rejection",
        "replay_match_cancellation",
        "replay_inactivity_decay",
        "replay_match",
      ],
    );
  },
);


test(
  "match_result y placement_completed no se duplican en cronología",
  () => {
    const chronology =
      buildReplayChronology({
        targetMatchId:
          100,

        matches: [
          {
            id:
              100,

            challenge_id:
              null,

            player1_id:
              1,

            player2_id:
              2,

            winner_id:
              1,

            completed_at:
              "2026-01-01T10:00:00.000Z",
          },
        ],

        events: [
          baseEvent({
            eventType:
              "match_result",
          }),

          baseEvent({
            id:
              2,

            eventType:
              "placement_completed",
          }),
        ],
      });

    assert.equal(
      chronology.length,
      1,
    );

    assert.equal(
      chronology[0].type,
      "annul_target_match",
    );
  },
);