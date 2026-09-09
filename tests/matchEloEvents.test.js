import test from "node:test";
import assert from "node:assert/strict";

import {
  MatchEloEventsError,
  buildMatchResultEvent,
  buildPlacementCompletedEvent,
  buildMatchEloEvents,
} from "../src/services/matchEloEvents.service.js";


const official = ({
  id,
  before = 1500,
  after = 1516,
  matchesBefore = 10,
  won = false,
  dethrone = false,
} = {}) => ({
  id,

  rating_before:
    before,

  rating_after:
    after,

  matches_before:
    matchesBefore,

  won,

  dethrone_applied:
    dethrone,

  placement:
    null,
});


const provisional = ({
  id,
  before = 0,
  after = 0,
  matchesBefore = 0,
  won = false,
  completed = false,
  percentile = null,
  targetPosition = null,
  targetElo = null,
} = {}) => ({
  id,

  rating_before:
    before,

  rating_after:
    after,

  matches_before:
    matchesBefore,

  won,

  dethrone_applied:
    false,

  placement: {
    applies:
      true,

    completed,

    placement_match_number:
      matchesBefore + 1,

    placement_percentile:
      percentile,

    target_position:
      targetPosition,

    target_elo:
      targetElo,
  },
});


test(
  "oficial ganador produce match_result con delta real",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          500,

        player:
          official({
            id:
              10,

            before:
              1500,

            after:
              1516,

            won:
              true,
          }),
      });

    assert.deepEqual(
      event,
      {
        user_id:
          10,

        match_id:
          500,

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
          "Victoria en partido #500",
      },
    );
  },
);


test(
  "oficial perdedor produce match_result negativo",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          500,

        player:
          official({
            id:
              20,

            before:
              1500,

            after:
              1484,

            won:
              false,
          }),
      });

    assert.equal(
      event.elo_change,
      -16,
    );

    assert.equal(
      event.elo_after,
      1484,
    );

    assert.equal(
      event.description,
      "Derrota en partido #500",
    );
  },
);


test(
  "destronamiento queda identificado en descripción",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          501,

        player:
          official({
            id:
              20,

            before:
              1900,

            after:
              1849,

            won:
              false,

            dethrone:
              true,
          }),
      });

    assert.match(
      event.description,
      /destronamiento/i,
    );
  },
);


test(
  "nivelatorio 1 produce match_result delta 0",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          600,

        player:
          provisional({
            id:
              10,

            before:
              0,

            after:
              0,

            matchesBefore:
              0,

            won:
              true,
          }),
      });

    assert.equal(
      event.event_type,
      "match_result",
    );

    assert.equal(
      event.elo_before,
      0,
    );

    assert.equal(
      event.elo_after,
      0,
    );

    assert.equal(
      event.elo_change,
      0,
    );

    assert.equal(
      event.description,
      "Nivelatorio 1/5 en partido #600",
    );
  },
);


test(
  "nivelatorio 4 sigue produciendo match_result delta 0",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          603,

        player:
          provisional({
            id:
              10,

            before:
              0,

            after:
              0,

            matchesBefore:
              3,

            won:
              false,
          }),
      });

    assert.equal(
      event.elo_change,
      0,
    );

    assert.equal(
      event.description,
      "Nivelatorio 4/5 en partido #603",
    );
  },
);


test(
  "quinto nivelatorio mantiene match_result en delta 0 aunque termine con Elo 1400",
  () => {
    const event =
      buildMatchResultEvent({
        matchId:
          604,

        player:
          provisional({
            id:
              10,

            before:
              0,

            after:
              1400,

            matchesBefore:
              4,

            won:
              true,

            completed:
              true,

            percentile:
              37.7,

            targetPosition:
              13,

            targetElo:
              1400,
          }),
      });

    assert.equal(
      event.event_type,
      "match_result",
    );

    assert.equal(
      event.elo_before,
      0,
    );

    assert.equal(
      event.elo_after,
      0,
    );

    assert.equal(
      event.elo_change,
      0,
    );
  },
);


test(
  "quinto nivelatorio genera placement_completed con asignación Elo",
  () => {
    const event =
      buildPlacementCompletedEvent({
        matchId:
          604,

        player:
          provisional({
            id:
              10,

            before:
              0,

            after:
              1400,

            matchesBefore:
              4,

            won:
              true,

            completed:
              true,

            percentile:
              37.7,

            targetPosition:
              13,

            targetElo:
              1400,
          }),
      });

    assert.ok(
      event,
    );

    assert.equal(
      event.event_type,
      "placement_completed",
    );

    assert.equal(
      event.elo_before,
      0,
    );

    assert.equal(
      event.elo_after,
      1400,
    );

    assert.equal(
      event.elo_change,
      1400,
    );

    assert.match(
      event.description,
      /37\.7%/,
    );

    assert.match(
      event.description,
      /#13/,
    );

    assert.match(
      event.description,
      /1400/,
    );
  },
);


test(
  "nivelatorio 1 a 4 no genera placement_completed",
  () => {
    for (
      let matchesBefore = 0;
      matchesBefore < 4;
      matchesBefore += 1
    ) {
      const event =
        buildPlacementCompletedEvent({
          matchId:
            700 +
            matchesBefore,

          player:
            provisional({
              id:
                10,

              matchesBefore,

              won:
                true,

              completed:
                false,
            }),
        });

      assert.equal(
        event,
        null,
      );
    }
  },
);


test(
  "jugador oficial nunca genera placement_completed",
  () => {
    const event =
      buildPlacementCompletedEvent({
        matchId:
          800,

        player:
          official({
            id:
              10,

            won:
              true,
          }),
      });

    assert.equal(
      event,
      null,
    );
  },
);


test(
  "placement_completed exige que target Elo coincida con rating final",
  () => {
    assert.throws(
      () =>
        buildPlacementCompletedEvent({
          matchId:
            900,

          player:
            provisional({
              id:
                10,

              before:
                0,

              after:
                1400,

              matchesBefore:
                4,

              completed:
                true,

              percentile:
                50,

              targetPosition:
                11,

              targetElo:
                1300,
            }),
        }),
      (error) => {
        assert.ok(
          error instanceof
            MatchEloEventsError,
        );

        assert.equal(
          error.reason,
          "placement_target_rating_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "placement_completed solamente puede corresponder al quinto nivelatorio",
  () => {
    assert.throws(
      () =>
        buildPlacementCompletedEvent({
          matchId:
            901,

          player: {
            id:
              10,

            rating_before:
              0,

            rating_after:
              1400,

            matches_before:
              2,

            won:
              true,

            placement: {
              applies:
                true,

              completed:
                true,

              placement_match_number:
                3,

              placement_percentile:
                50,

              target_position:
                11,

              target_elo:
                1400,
            },
          },
        }),
      (error) => {
        assert.equal(
          error.reason,
          "placement_completed_wrong_match",
        );

        return true;
      },
    );
  },
);


test(
  "partido oficial vs oficial produce exactamente dos match_result",
  () => {
    const plan =
      buildMatchEloEvents({
        matchId:
          1000,

        challengeId:
          55,

        player1:
          official({
            id:
              10,

            before:
              1500,

            after:
              1516,

            won:
              true,
          }),

        player2:
          official({
            id:
              20,

            before:
              1500,

            after:
              1484,

            won:
              false,
          }),
      });

    assert.equal(
      plan.events.length,
      2,
    );

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      0,
    );

    assert.deepEqual(
      plan.events.map(
        (event) =>
          event.event_type,
      ),
      [
        "match_result",
        "match_result",
      ],
    );

    assert.equal(
      plan.events[0]
        .challenge_id,
      55,
    );

    assert.equal(
      plan.events[1]
        .challenge_id,
      55,
    );
  },
);


test(
  "provisional #3 vs oficial produce dos match_result y ninguna graduación",
  () => {
    const plan =
      buildMatchEloEvents({
        matchId:
          1100,

        player1:
          provisional({
            id:
              10,

            matchesBefore:
              2,

            won:
              true,
          }),

        player2:
          official({
            id:
              20,

            before:
              1600,

            after:
              1400,

            won:
              false,
          }),
      });

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      0,
    );

    assert.equal(
      plan.events.length,
      2,
    );

    assert.equal(
      plan.events[0]
        .elo_change,
      0,
    );

    assert.equal(
      plan.events[1]
        .elo_change,
      -200,
    );
  },
);


test(
  "quinto nivelatorio vs oficial produce dos match_result más una graduación",
  () => {
    const plan =
      buildMatchEloEvents({
        matchId:
          1200,

        player1:
          provisional({
            id:
              10,

            before:
              0,

            after:
              1400,

            matchesBefore:
              4,

            won:
              true,

            completed:
              true,

            percentile:
              37.7,

            targetPosition:
              13,

            targetElo:
              1400,
          }),

        player2:
          official({
            id:
              20,

            before:
              1600,

            after:
              1400,

            won:
              false,
          }),
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

    assert.deepEqual(
      plan.events.map(
        (event) =>
          event.event_type,
      ),
      [
        "match_result",
        "match_result",
        "placement_completed",
      ],
    );

    assert.equal(
      plan.events[0]
        .elo_change,
      0,
    );

    assert.equal(
      plan.events[2]
        .elo_change,
      1400,
    );
  },
);


test(
  "dos provisionales en quinto nivelatorio producen dos match_result y dos graduaciones",
  () => {
    const plan =
      buildMatchEloEvents({
        matchId:
          1300,

        player1:
          provisional({
            id:
              10,

            before:
              0,

            after:
              1450,

            matchesBefore:
              4,

            won:
              true,

            completed:
              true,

            percentile:
              60,

            targetPosition:
              9,

            targetElo:
              1450,
          }),

        player2:
          provisional({
            id:
              20,

            before:
              0,

            after:
              1200,

            matchesBefore:
              4,

            won:
              false,

            completed:
              true,

            percentile:
              20,

            targetPosition:
              17,

            targetElo:
              1200,
          }),
      });

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      2,
    );

    assert.equal(
      plan.events.length,
      4,
    );

    assert.deepEqual(
      plan.events.map(
        (event) =>
          event.event_type,
      ),
      [
        "match_result",
        "match_result",
        "placement_completed",
        "placement_completed",
      ],
    );

    assert.equal(
      plan.events[0]
        .elo_change,
      0,
    );

    assert.equal(
      plan.events[1]
        .elo_change,
      0,
    );

    assert.equal(
      plan.events[2]
        .elo_change,
      1450,
    );

    assert.equal(
      plan.events[3]
        .elo_change,
      1200,
    );
  },
);


test(
  "dos provisionales antes del quinto generan solamente dos match_result",
  () => {
    const plan =
      buildMatchEloEvents({
        matchId:
          1400,

        player1:
          provisional({
            id:
              10,

            matchesBefore:
              1,

            won:
              true,
          }),

        player2:
          provisional({
            id:
              20,

            matchesBefore:
              3,

            won:
              false,
          }),
      });

    assert.equal(
      plan.events.length,
      2,
    );

    assert.equal(
      plan.match_result_count,
      2,
    );

    assert.equal(
      plan.placement_completed_count,
      0,
    );

    assert.equal(
      plan.events[0]
        .elo_change,
      0,
    );

    assert.equal(
      plan.events[1]
        .elo_change,
      0,
    );
  },
);


test(
  "rechaza estado sin ganador único",
  () => {
    assert.throws(
      () =>
        buildMatchEloEvents({
          matchId:
            1500,

          player1:
            official({
              id:
                10,

              won:
                false,
            }),

          player2:
            official({
              id:
                20,

              won:
                false,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_winner_state",
        );

        return true;
      },
    );

    assert.throws(
      () =>
        buildMatchEloEvents({
          matchId:
            1501,

          player1:
            official({
              id:
                10,

              won:
                true,
            }),

          player2:
            official({
              id:
                20,

              won:
                true,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "invalid_winner_state",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza mismo jugador en ambos lados",
  () => {
    assert.throws(
      () =>
        buildMatchEloEvents({
          matchId:
            1600,

          player1:
            official({
              id:
                10,

              won:
                true,
            }),

          player2:
            official({
              id:
                10,

              won:
                false,
            }),
        }),
      (error) => {
        assert.equal(
          error.reason,
          "same_player",
        );

        return true;
      },
    );
  },
);