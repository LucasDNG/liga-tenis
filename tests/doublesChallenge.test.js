import test from "node:test";
import assert from "node:assert/strict";

import {
  DoublesChallengeError,
  getUserChallengeSide,
  assertUserCanRespondToDoublesChallenge,
  assertUserCanScheduleDoublesChallenge,
} from "../src/services/doublesChallenge.service.js";


const challenge = {
  challenger_player1_id:
    10,

  challenger_player2_id:
    20,

  challenged_player1_id:
    30,

  challenged_player2_id:
    40,
};


test(
  "identifica primer integrante del lado desafiante",
  () => {
    assert.equal(
      getUserChallengeSide(
        challenge,
        10,
      ),
      1,
    );
  },
);


test(
  "identifica segundo integrante del lado desafiante",
  () => {
    assert.equal(
      getUserChallengeSide(
        challenge,
        20,
      ),
      1,
    );
  },
);


test(
  "identifica primer integrante de la pareja desafiada",
  () => {
    assert.equal(
      getUserChallengeSide(
        challenge,
        30,
      ),
      2,
    );
  },
);


test(
  "identifica segundo integrante de la pareja desafiada",
  () => {
    assert.equal(
      getUserChallengeSide(
        challenge,
        40,
      ),
      2,
    );
  },
);


test(
  "usuario ajeno no pertenece a ningún lado",
  () => {
    assert.equal(
      getUserChallengeSide(
        challenge,
        99,
      ),
      null,
    );
  },
);


test(
  "cualquiera de los dos integrantes desafiados puede aceptar o rechazar",
  () => {
    assert.equal(
      assertUserCanRespondToDoublesChallenge(
        challenge,
        30,
      ),
      2,
    );

    assert.equal(
      assertUserCanRespondToDoublesChallenge(
        challenge,
        40,
      ),
      2,
    );
  },
);


test(
  "integrante desafiante no puede responder su propio desafío",
  () => {
    assert.throws(
      () =>
        assertUserCanRespondToDoublesChallenge(
          challenge,
          10,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            DoublesChallengeError,
        );

        assert.equal(
          error.reason,
          "not_challenged_pair_member",
        );

        return true;
      },
    );
  },
);


test(
  "cualquiera de los cuatro puede intervenir en la coordinación",
  () => {
    for (
      const userId of
      [
        10,
        20,
        30,
        40,
      ]
    ) {
      assert.ok(
        [
          1,
          2,
        ].includes(
          assertUserCanScheduleDoublesChallenge(
            challenge,
            userId,
          ),
        ),
      );
    }
  },
);


test(
  "usuario externo no puede coordinar el desafío",
  () => {
    assert.throws(
      () =>
        assertUserCanScheduleDoublesChallenge(
          challenge,
          99,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            DoublesChallengeError,
        );

        assert.equal(
          error.reason,
          "user_not_in_challenge",
        );

        return true;
      },
    );
  },
);