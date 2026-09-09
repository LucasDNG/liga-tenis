import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeEloEvent,
  validateMatchEloEventPlan,
  EloEventPersistenceError,
} from "../src/services/eloEventPersistence.service.js";


const event = (
  userId,
  {
    competitionId = 3,
    matchId = 100,
    challengeId = 50,
    before = 1200,
    change = 16,
    type = "match_result",
  } = {},
) => ({
  user_id:
    userId,

  competition_id:
    competitionId,

  match_id:
    matchId,

  challenge_id:
    challengeId,

  event_type:
    type,

  elo_before:
    before,

  elo_change:
    change,

  elo_after:
    before + change,

  description:
    "test",
});


test(
  "normalizeEloEvent conserva competition_id",
  () => {
    const normalized =
      normalizeEloEvent(
        event(
          10,
        ),
      );

    assert.equal(
      normalized
        .competition_id,
      3,
    );
  },
);


test(
  "normalizeEloEvent rechaza evento sin competition_id",
  () => {
    const invalid =
      event(
        10,
      );

    delete invalid
      .competition_id;

    assert.throws(
      () =>
        normalizeEloEvent(
          invalid,
        ),

      (
        error,
      ) =>
        error instanceof
          EloEventPersistenceError &&
        error.reason ===
          "invalid_positive_integer",
    );
  },
);


test(
  "validateMatchEloEventPlan acepta dos match_result de la misma competicion",
  () => {
    const plan =
      validateMatchEloEventPlan({
        competition_id:
          3,

        match_id:
          100,

        challenge_id:
          50,

        events: [
          event(
            10,
            {
              change:
                16,
            },
          ),

          event(
            20,
            {
              change:
                -16,
            },
          ),
        ],
      });

    assert.equal(
      plan
        .competition_id,
      3,
    );

    assert.equal(
      plan
        .match_result_count,
      2,
    );
  },
);


test(
  "validateMatchEloEventPlan rechaza evento de otra competicion",
  () => {
    assert.throws(
      () =>
        validateMatchEloEventPlan({
          competition_id:
            3,

          match_id:
            100,

          challenge_id:
            50,

          events: [
            event(
              10,
            ),

            event(
              20,
              {
                competitionId:
                  4,
                change:
                  -16,
              },
            ),
          ],
        }),

      (
        error,
      ) =>
        error instanceof
          EloEventPersistenceError &&
        error.reason ===
          "event_competition_id_mismatch",
    );
  },
);