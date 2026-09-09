import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMatchEloEvents,
  MatchEloEventsError,
} from "../src/services/matchEloEvents.service.js";


const officialPlayer = (
  id,
  {
    before,
    after,
    won,
  },
) => ({
  id,
  rating_before:
    before,
  rating_after:
    after,
  matches_before:
    10,
  won,
  dethrone_applied:
    false,
  placement:
    null,
});


test(
  "buildMatchEloEvents agrega competition_id al plan y a todos los eventos",
  () => {
    const plan =
      buildMatchEloEvents({
        competitionId:
          4,

        matchId:
          100,

        challengeId:
          50,

        player1:
          officialPlayer(
            10,
            {
              before:
                1200,
              after:
                1216,
              won:
                true,
            },
          ),

        player2:
          officialPlayer(
            20,
            {
              before:
                1200,
              after:
                1184,
              won:
                false,
            },
          ),
      });

    assert.equal(
      plan.competition_id,
      4,
    );

    assert.equal(
      plan.match_id,
      100,
    );

    assert.equal(
      plan.events.length,
      2,
    );

    assert.ok(
      plan.events.every(
        (event) =>
          event.competition_id ===
          4,
      ),
    );
  },
);


test(
  "buildMatchEloEvents exige competitionId",
  () => {
    assert.throws(
      () =>
        buildMatchEloEvents({
          matchId:
            100,

          player1:
            officialPlayer(
              10,
              {
                before:
                  1200,
                after:
                  1216,
                won:
                  true,
              },
            ),

          player2:
            officialPlayer(
              20,
              {
                before:
                  1200,
                after:
                  1184,
                won:
                  false,
              },
            ),
        }),

      (
        error,
      ) =>
        error instanceof
          MatchEloEventsError &&
        error.reason ===
          "invalid_integer",
    );
  },
);