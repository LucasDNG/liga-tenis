import test from "node:test";
import assert from "node:assert/strict";

import {
  ChallengeControllerSupportError,
  parsePositiveId,
  validateChallengeSchedule,
  serializeCompetition,
} from "../src/services/challengeControllerSupport.service.js";


const assertReason =
  (
    reason,
  ) =>
  (
    error,
  ) => {
    assert.ok(
      error instanceof
        ChallengeControllerSupportError,
    );

    assert.equal(
      error.reason,
      reason,
    );

    return true;
  };


test(
  "parsePositiveId acepta entero positivo",
  () => {
    assert.equal(
      parsePositiveId(
        "12",
        "challengeId",
      ),
      12,
    );
  },
);


test(
  "parsePositiveId rechaza cero",
  () => {
    assert.throws(
      () =>
        parsePositiveId(
          0,
          "challengeId",
        ),
      assertReason(
        "invalid_identifier",
      ),
    );
  },
);


test(
  "parsePositiveId rechaza texto",
  () => {
    assert.throws(
      () =>
        parsePositiveId(
          "abc",
          "challengeId",
        ),
      assertReason(
        "invalid_identifier",
      ),
    );
  },
);


test(
  "validateChallengeSchedule normaliza lugar y fecha",
  () => {
    const future =
      new Date(
        Date.now() +
          60 * 60 * 1000,
      );

    const result =
      validateChallengeSchedule({
        venue:
          "  Club San Pedro  ",

        scheduledAt:
          future.toISOString(),
      });

    assert.equal(
      result.venue,
      "Club San Pedro",
    );

    assert.equal(
      result.scheduled_at,
      future.toISOString(),
    );
  },
);


test(
  "validateChallengeSchedule rechaza lugar corto",
  () => {
    const future =
      new Date(
        Date.now() +
          60 * 60 * 1000,
      );

    assert.throws(
      () =>
        validateChallengeSchedule({
          venue: "A",
          scheduledAt:
            future.toISOString(),
        }),
      assertReason(
        "invalid_venue",
      ),
    );
  },
);


test(
  "validateChallengeSchedule rechaza fecha inválida",
  () => {
    assert.throws(
      () =>
        validateChallengeSchedule({
          venue:
            "Club San Pedro",
          scheduledAt:
            "no-es-fecha",
        }),
      assertReason(
        "invalid_schedule",
      ),
    );
  },
);


test(
  "validateChallengeSchedule rechaza fecha pasada",
  () => {
    const past =
      new Date(
        Date.now() -
          60 * 60 * 1000,
      );

    assert.throws(
      () =>
        validateChallengeSchedule({
          venue:
            "Club San Pedro",
          scheduledAt:
            past.toISOString(),
        }),
      assertReason(
        "schedule_in_past",
      ),
    );
  },
);


test(
  "serializeCompetition devuelve contrato estable",
  () => {
    assert.deepEqual(
      serializeCompetition({
        id: "4",
        format:
          "singles",
        gender:
          "male",
        city:
          "San Pedro",
        name:
          "Singles Masculino",
        team_size:
          "1",
        placement_matches:
          "5",
      }),
      {
        id: 4,
        format:
          "singles",
        gender:
          "male",
        city:
          "San Pedro",
        name:
          "Singles Masculino",
        team_size: 1,
        placement_matches: 5,
      },
    );
  },
);