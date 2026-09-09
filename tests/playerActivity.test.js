import test from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_WINDOW_DAYS,
  INACTIVITY_ELO_PENALTY,
  PlayerActivityError,
  calculatePlayerActivity,
  calculateInactivityDecay,
} from "../src/services/playerActivity.service.js";


const DAY_MS =
  24 * 60 * 60 * 1000;


test(
  "ventana de actividad es 30 días",
  () => {
    assert.equal(
      ACTIVITY_WINDOW_DAYS,
      30,
    );
  },
);


test(
  "penalización de inactividad es 10 Elo",
  () => {
    assert.equal(
      INACTIVITY_ELO_PENALTY,
      10,
    );
  },
);


test(
  "exactamente 30 días sigue activo",
  () => {
    const anchor =
      new Date(
        "2026-01-01T00:00:00.000Z",
      );

    const now =
      new Date(
        anchor.getTime() +
        30 * DAY_MS,
      );

    const result =
      calculatePlayerActivity({
        player: {
          id:
            1,

          rating:
            1500,

          matches_played:
            10,

          activity_anchor_at:
            anchor,
        },

        now,
      });

    assert.equal(
      result.active,
      true,
    );

    assert.equal(
      result.inactive,
      false,
    );

    assert.equal(
      result.full_inactive_months,
      0,
    );
  },
);


test(
  "más de 30 días queda inactivo",
  () => {
    const anchor =
      new Date(
        "2026-01-01T00:00:00.000Z",
      );

    const now =
      new Date(
        anchor.getTime() +
        30 * DAY_MS +
        1,
      );

    const result =
      calculatePlayerActivity({
        player: {
          id:
            1,

          rating:
            1500,

          matches_played:
            10,

          activity_anchor_at:
            anchor,
        },

        now,
      });

    assert.equal(
      result.active,
      false,
    );

    assert.equal(
      result.inactive,
      true,
    );

    assert.equal(
      result.full_inactive_months,
      1,
    );
  },
);


test(
  "60 días completos equivalen a dos bloques",
  () => {
    const anchor =
      new Date(
        "2026-01-01T00:00:00.000Z",
      );

    const now =
      new Date(
        anchor.getTime() +
        60 * DAY_MS,
      );

    const result =
      calculatePlayerActivity({
        player: {
          id:
            1,

          rating:
            1500,

          matches_played:
            10,

          activity_anchor_at:
            anchor,
        },

        now,
      });

    assert.equal(
      result.inactive,
      true,
    );

    assert.equal(
      result.full_inactive_months,
      2,
    );
  },
);


test(
  "provisional se identifica con menos de 5 partidos",
  () => {
    const result =
      calculatePlayerActivity({
        player: {
          id:
            2,

          rating:
            0,

          matches_played:
            4,

          activity_anchor_at:
            "2026-01-01T00:00:00.000Z",
        },

        now:
          "2026-01-02T00:00:00.000Z",
      });

    assert.equal(
      result.provisional,
      true,
    );
  },
);


test(
  "con 5 partidos deja de ser provisional",
  () => {
    const result =
      calculatePlayerActivity({
        player: {
          id:
            2,

          rating:
            1200,

          matches_played:
            5,

          activity_anchor_at:
            "2026-01-01T00:00:00.000Z",
        },

        now:
          "2026-01-02T00:00:00.000Z",
      });

    assert.equal(
      result.provisional,
      false,
    );
  },
);


test(
  "decay provisional resta 10 con piso 0",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          30,

        matchesPlayed:
          3,
      });

    assert.equal(
      result.provisional,
      true,
    );

    assert.equal(
      result.elo_before,
      30,
    );

    assert.equal(
      result.elo_change,
      -10,
    );

    assert.equal(
      result.elo_after,
      20,
    );

    assert.equal(
      result.elo_floor,
      0,
    );
  },
);


test(
  "decay provisional no baja de 0",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          4,

        matchesPlayed:
          4,
      });

    assert.equal(
      result.elo_after,
      0,
    );

    assert.equal(
      result.elo_change,
      -4,
    );

    assert.equal(
      result.effective_penalty,
      4,
    );
  },
);


test(
  "provisional en 0 conserva delta 0",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          0,

        matchesPlayed:
          2,
      });

    assert.equal(
      result.elo_after,
      0,
    );

    assert.equal(
      result.elo_change,
      0,
    );

    assert.equal(
      Object.is(
        result.elo_change,
        -0,
      ),
      false,
    );
  },
);


test(
  "oficial normal pierde 10 Elo",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          1500,

        matchesPlayed:
          10,
      });

    assert.equal(
      result.provisional,
      false,
    );

    assert.equal(
      result.elo_change,
      -10,
    );

    assert.equal(
      result.elo_after,
      1490,
    );

    assert.equal(
      result.elo_floor,
      100,
    );
  },
);


test(
  "oficial normal respeta piso 100",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          105,

        matchesPlayed:
          10,
      });

    assert.equal(
      result.elo_after,
      100,
    );

    assert.equal(
      result.elo_change,
      -5,
    );
  },
);


test(
  "oficial en 100 no baja más",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          100,

        matchesPlayed:
          10,
      });

    assert.equal(
      result.elo_after,
      100,
    );

    assert.equal(
      result.elo_change,
      0,
    );
  },
);


test(
  "oficial ya debajo de 100 usa piso 0",
  () => {
    const result =
      calculateInactivityDecay({
        rating:
          80,

        matchesPlayed:
          10,
      });

    assert.equal(
      result.elo_floor,
      0,
    );

    assert.equal(
      result.elo_after,
      70,
    );

    assert.equal(
      result.elo_change,
      -10,
    );
  },
);


test(
  "rechaza jugador sin activity anchor",
  () => {
    assert.throws(
      () =>
        calculatePlayerActivity({
          player: {
            id:
              1,

            rating:
              1500,

            matches_played:
              10,
          },
        }),
      (error) => {
        assert.ok(
          error instanceof
            PlayerActivityError,
        );

        assert.equal(
          error.reason,
          "activity_anchor_missing",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza rating negativo",
  () => {
    assert.throws(
      () =>
        calculateInactivityDecay({
          rating:
            -1,

          matchesPlayed:
            10,
        }),
      PlayerActivityError,
    );
  },
);