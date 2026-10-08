import test from "node:test";
import assert from "node:assert/strict";

import {
  canConfirmOrRejectMatchResult,
  canEditMatchScore,
  canRequestMatchCancellation,
  getSubmittedSide,
  getWinnerLabel,
  isMatchResultBlocked,
  submittedByMySide,
} from "../frontend/src/matchResultAccess.js";


test(
  "un partido de dobles pendiente y ya iniciado se puede cargar",
  () => {
    assert.equal(
      canEditMatchScore({
        status:
          "pending",

        hasCancellationRequest:
          false,
      }),
      true,
    );

    assert.equal(
      isMatchResultBlocked({
        status:
          "pending",

        matchStarted:
          true,
      }),
      false,
    );
  },
);


test(
  "el resultado sigue bloqueado antes del horario",
  () => {
    assert.equal(
      isMatchResultBlocked({
        status:
          "pending",

        matchStarted:
          false,
      }),
      true,
    );
  },
);


test(
  "la pareja que cargó el resultado no puede confirmarlo",
  () => {
    const match = {
      result_submitted_by:
        12,

      participants: [
        {
          user_id:
            11,
          side:
            1,
        },
        {
          user_id:
            12,
          side:
            1,
        },
        {
          user_id:
            21,
          side:
            2,
        },
      ],
    };

    assert.equal(
      getSubmittedSide(
        match,
      ),
      1,
    );

    assert.equal(
      submittedByMySide({
        mySide:
          1,

        submittedSide:
          1,

        submittedByMe:
          false,
      }),
      true,
    );

    assert.equal(
      canConfirmOrRejectMatchResult({
        status:
          "awaiting_confirmation",

        mySide:
          1,

        submittedSide:
          1,

        submittedByMe:
          false,
      }),
      false,
    );

    assert.equal(
      canConfirmOrRejectMatchResult({
        status:
          "awaiting_confirmation",

        mySide:
          2,

        submittedSide:
          1,

        submittedByMe:
          false,
      }),
      true,
    );
  },
);


test(
  "la cancelación de dobles no se ofrece",
  () => {
    assert.equal(
      canRequestMatchCancellation({
        status:
          "pending",

        format:
          "doubles",

        hasCancellationRequest:
          false,
      }),
      false,
    );

    assert.equal(
      canRequestMatchCancellation({
        status:
          "pending",

        format:
          "singles",

        hasCancellationRequest:
          false,
      }),
      true,
    );
  },
);


test(
  "el ganador de dobles se muestra como pareja",
  () => {
    assert.equal(
      getWinnerLabel({
        format:
          "doubles",

        winnerId:
          21,

        winnerName:
          "Ana",

        side1: [
          {
            user_id:
              11,
          },
        ],

        side2: [
          {
            user_id:
              21,
          },
          {
            user_id:
              22,
          },
        ],

        side1Name:
          "Luis / Marcos",

        side2Name:
          "Ana / Sofía",
      }),
      "Ana / Sofía",
    );
  },
);
