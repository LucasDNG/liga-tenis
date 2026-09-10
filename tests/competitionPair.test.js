import test from "node:test";
import assert from "node:assert/strict";

import {
  CompetitionPairError,
  canonicalizePairPlayerIds,
  pairContainsUser,
  getOtherPairMemberId,
} from "../src/services/competitionPair.service.js";


test(
  "canonicaliza pareja conservando menor ID primero",
  () => {
    assert.deepEqual(
      canonicalizePairPlayerIds(
        5,
        12,
      ),
      {
        player1_id:
          5,

        player2_id:
          12,
      },
    );
  },
);


test(
  "A/B y B/A representan exactamente la misma pareja",
  () => {
    const first =
      canonicalizePairPlayerIds(
        5,
        12,
      );

    const second =
      canonicalizePairPlayerIds(
        12,
        5,
      );

    assert.deepEqual(
      first,
      second,
    );
  },
);


test(
  "rechaza formar pareja con uno mismo",
  () => {
    assert.throws(
      () =>
        canonicalizePairPlayerIds(
          5,
          5,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionPairError,
        );

        assert.equal(
          error.reason,
          "duplicate_pair_player",
        );

        return true;
      },
    );
  },
);


test(
  "detecta cualquiera de los dos integrantes",
  () => {
    const pair = {
      id:
        99,

      player1_id:
        5,

      player2_id:
        12,
    };

    assert.equal(
      pairContainsUser(
        pair,
        5,
      ),
      true,
    );

    assert.equal(
      pairContainsUser(
        pair,
        12,
      ),
      true,
    );

    assert.equal(
      pairContainsUser(
        pair,
        20,
      ),
      false,
    );
  },
);


test(
  "obtiene el compañero del jugador 1",
  () => {
    const pair = {
      id:
        99,

      player1_id:
        5,

      player2_id:
        12,
    };

    assert.equal(
      getOtherPairMemberId(
        pair,
        5,
      ),
      12,
    );
  },
);


test(
  "obtiene el compañero del jugador 2",
  () => {
    const pair = {
      id:
        99,

      player1_id:
        5,

      player2_id:
        12,
    };

    assert.equal(
      getOtherPairMemberId(
        pair,
        12,
      ),
      5,
    );
  },
);


test(
  "no permite obtener compañero de usuario ajeno",
  () => {
    const pair = {
      id:
        99,

      player1_id:
        5,

      player2_id:
        12,
    };

    assert.throws(
      () =>
        getOtherPairMemberId(
          pair,
          20,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionPairError,
        );

        assert.equal(
          error.reason,
          "user_not_in_pair",
        );

        return true;
      },
    );
  },
);