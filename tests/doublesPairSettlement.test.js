import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateGamesBySide,
} from "../src/services/doublesPairSettlement.service.js";


test(
  "2-0 suma games correctamente",
  () => {
    const result =
      calculateGamesBySide([
        {
          p1: 6,
          p2: 3,
        },
        {
          p1: 6,
          p2: 4,
        },
      ]);

    assert.deepEqual(
      result,
      {
        side1_games:
          12,

        side2_games:
          7,
      },
    );
  },
);


test(
  "partido de tres sets suma games correctamente",
  () => {
    const result =
      calculateGamesBySide([
        {
          p1: 6,
          p2: 4,
        },
        {
          p1: 3,
          p2: 6,
        },
        {
          p1: 7,
          p2: 5,
        },
      ]);

    assert.deepEqual(
      result,
      {
        side1_games:
          16,

        side2_games:
          15,
      },
    );
  },
);


test(
  "acepta games enviados como strings enteros",
  () => {
    const result =
      calculateGamesBySide([
        {
          p1: "6",
          p2: "4",
        },
        {
          p1: "7",
          p2: "5",
        },
      ]);

    assert.deepEqual(
      result,
      {
        side1_games:
          13,

        side2_games:
          9,
      },
    );
  },
);


test(
  "rechaza score vacío",
  () => {
    assert.throws(
      () =>
        calculateGamesBySide(
          [],
        ),
    );
  },
);


test(
  "rechaza más de tres sets",
  () => {
    assert.throws(
      () =>
        calculateGamesBySide([
          {
            p1: 6,
            p2: 0,
          },
          {
            p1: 0,
            p2: 6,
          },
          {
            p1: 6,
            p2: 0,
          },
          {
            p1: 6,
            p2: 0,
          },
        ]),
    );
  },
);


test(
  "rechaza games negativos",
  () => {
    assert.throws(
      () =>
        calculateGamesBySide([
          {
            p1: -1,
            p2: 6,
          },
          {
            p1: 6,
            p2: 4,
          },
        ]),
    );
  },
);