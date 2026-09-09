import test from "node:test";
import assert from "node:assert/strict";

import {
  splitParticipantsBySide,
  getWinningAndLosingSides,
  assertSinglesMatch,
  assertDoublesMatch,
  MatchCompetitionError,
} from "../src/services/matchCompetition.service.js";


const singlesParticipants = [
  {
    user_id: 10,
    side: 1,
    position: 1,
  },
  {
    user_id: 20,
    side: 2,
    position: 1,
  },
];


const doublesParticipants = [
  {
    user_id: 10,
    side: 1,
    position: 1,
  },
  {
    user_id: 11,
    side: 1,
    position: 2,
  },
  {
    user_id: 20,
    side: 2,
    position: 1,
  },
  {
    user_id: 21,
    side: 2,
    position: 2,
  },
];


test(
  "singles se divide 1 contra 1",
  () => {
    const result =
      splitParticipantsBySide(
        singlesParticipants,
        1,
      );

    assert.deepEqual(
      result.side1.map(
        (player) =>
          player.user_id,
      ),
      [10],
    );

    assert.deepEqual(
      result.side2.map(
        (player) =>
          player.user_id,
      ),
      [20],
    );
  },
);


test(
  "dobles se divide 2 contra 2",
  () => {
    const result =
      splitParticipantsBySide(
        doublesParticipants,
        2,
      );

    assert.deepEqual(
      result.side1.map(
        (player) =>
          player.user_id,
      ),
      [10, 11],
    );

    assert.deepEqual(
      result.side2.map(
        (player) =>
          player.user_id,
      ),
      [20, 21],
    );
  },
);


test(
  "lado 1 ganador devuelve dos ganadores en dobles",
  () => {
    const result =
      getWinningAndLosingSides(
        doublesParticipants,
        2,
        1,
      );

    assert.equal(
      result.winning_side,
      1,
    );

    assert.equal(
      result.losing_side,
      2,
    );

    assert.deepEqual(
      result.winners.map(
        (player) =>
          player.user_id,
      ),
      [10, 11],
    );

    assert.deepEqual(
      result.losers.map(
        (player) =>
          player.user_id,
      ),
      [20, 21],
    );
  },
);


test(
  "lado 2 ganador devuelve dos ganadores en dobles",
  () => {
    const result =
      getWinningAndLosingSides(
        doublesParticipants,
        2,
        2,
      );

    assert.deepEqual(
      result.winners.map(
        (player) =>
          player.user_id,
      ),
      [20, 21],
    );

    assert.deepEqual(
      result.losers.map(
        (player) =>
          player.user_id,
      ),
      [10, 11],
    );
  },
);


test(
  "singles reconoce competición 1v1",
  () => {
    assert.equal(
      assertSinglesMatch({
        competition_id: 1,
        format: "singles",
        team_size: 1,
      }),
      true,
    );
  },
);


test(
  "dobles reconoce competición 2v2",
  () => {
    assert.equal(
      assertDoublesMatch({
        competition_id: 2,
        format: "doubles",
        team_size: 2,
      }),
      true,
    );
  },
);


test(
  "dobles no puede entrar en operación exclusiva de singles",
  () => {
    assert.throws(
      () =>
        assertSinglesMatch({
          competition_id: 2,
          format: "doubles",
          team_size: 2,
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchCompetitionError,
        );

        assert.equal(
          error.reason,
          "singles_required",
        );

        return true;
      },
    );
  },
);


test(
  "singles no puede entrar en operación exclusiva de dobles",
  () => {
    assert.throws(
      () =>
        assertDoublesMatch({
          competition_id: 1,
          format: "singles",
          team_size: 1,
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchCompetitionError,
        );

        assert.equal(
          error.reason,
          "doubles_required",
        );

        return true;
      },
    );
  },
);