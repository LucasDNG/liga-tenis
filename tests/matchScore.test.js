import test from "node:test";
import assert from "node:assert/strict";

import {
  MatchScoreError,
  parseGameValue,
  isValidSet,
  parseMatchScore,
  validateMatchScore,
} from "../src/services/matchScore.service.js";


/*
  ============================================================
  GAME VALUE
  ============================================================
*/

test(
  "parseGameValue acepta entero number",
  () => {
    assert.equal(
      parseGameValue(
        6,
      ),
      6,
    );
  },
);


test(
  "parseGameValue acepta entero string",
  () => {
    assert.equal(
      parseGameValue(
        "6",
      ),
      6,
    );
  },
);


test(
  "parseGameValue acepta string con espacios",
  () => {
    assert.equal(
      parseGameValue(
        " 7 ",
      ),
      7,
    );
  },
);


test(
  "parseGameValue rechaza vacío",
  () => {
    assert.equal(
      parseGameValue(
        "",
      ),
      null,
    );

    assert.equal(
      parseGameValue(
        "   ",
      ),
      null,
    );
  },
);


test(
  "parseGameValue rechaza null y undefined",
  () => {
    assert.equal(
      parseGameValue(
        null,
      ),
      null,
    );

    assert.equal(
      parseGameValue(
        undefined,
      ),
      null,
    );
  },
);


test(
  "parseGameValue rechaza boolean",
  () => {
    assert.equal(
      parseGameValue(
        true,
      ),
      null,
    );

    assert.equal(
      parseGameValue(
        false,
      ),
      null,
    );
  },
);


test(
  "parseGameValue rechaza decimal",
  () => {
    assert.equal(
      parseGameValue(
        6.5,
      ),
      null,
    );

    assert.equal(
      parseGameValue(
        "6.5",
      ),
      null,
    );
  },
);


/*
  ============================================================
  SET
  ============================================================
*/

test(
  "acepta 6-0 a 6-4",
  () => {
    for (
      let loserGames = 0;
      loserGames <= 4;
      loserGames += 1
    ) {
      assert.equal(
        isValidSet(
          6,
          loserGames,
        ),
        true,
      );

      assert.equal(
        isValidSet(
          loserGames,
          6,
        ),
        true,
      );
    }
  },
);


test(
  "acepta 7-5",
  () => {
    assert.equal(
      isValidSet(
        7,
        5,
      ),
      true,
    );

    assert.equal(
      isValidSet(
        5,
        7,
      ),
      true,
    );
  },
);


test(
  "acepta 7-6",
  () => {
    assert.equal(
      isValidSet(
        7,
        6,
      ),
      true,
    );

    assert.equal(
      isValidSet(
        6,
        7,
      ),
      true,
    );
  },
);


test(
  "rechaza 6-5",
  () => {
    assert.equal(
      isValidSet(
        6,
        5,
      ),
      false,
    );
  },
);


test(
  "rechaza 7-4",
  () => {
    assert.equal(
      isValidSet(
        7,
        4,
      ),
      false,
    );
  },
);


test(
  "rechaza 8-6",
  () => {
    assert.equal(
      isValidSet(
        8,
        6,
      ),
      false,
    );
  },
);


test(
  "rechaza empate de games",
  () => {
    assert.equal(
      isValidSet(
        6,
        6,
      ),
      false,
    );

    assert.equal(
      isValidSet(
        7,
        7,
      ),
      false,
    );
  },
);


test(
  "rechaza negativos",
  () => {
    assert.equal(
      isValidSet(
        6,
        -1,
      ),
      false,
    );
  },
);


/*
  ============================================================
  PARTIDO 2-0
  ============================================================
*/

test(
  "acepta victoria 2-0 de P1",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            7,

          p2:
            5,
        },
      ]);

    assert.equal(
      result.error,
      undefined,
    );

    assert.equal(
      result.winnerSide,
      1,
    );

    assert.deepEqual(
      result.normalizedScore,
      [
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            7,

          p2:
            5,
        },
      ],
    );
  },
);


test(
  "acepta victoria 2-0 de P2",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            2,

          p2:
            6,
        },
        {
          p1:
            6,

          p2:
            7,
        },
      ]);

    assert.equal(
      result.winnerSide,
      2,
    );
  },
);


/*
  ============================================================
  PARTIDO 2-1
  ============================================================
*/

test(
  "acepta victoria 2-1 de P1",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            3,

          p2:
            6,
        },
        {
          p1:
            7,

          p2:
            6,
        },
      ]);

    assert.equal(
      result.error,
      undefined,
    );

    assert.equal(
      result.winnerSide,
      1,
    );
  },
);


test(
  "acepta victoria 2-1 de P2",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            2,
        },
        {
          p1:
            5,

          p2:
            7,
        },
        {
          p1:
            4,

          p2:
            6,
        },
      ]);

    assert.equal(
      result.error,
      undefined,
    );

    assert.equal(
      result.winnerSide,
      2,
    );
  },
);


/*
  ============================================================
  ERRORES DE ESTRUCTURA
  ============================================================
*/

test(
  "rechaza score que no es array",
  () => {
    const result =
      parseMatchScore(
        null,
      );

    assert.equal(
      result.error,
      "El partido debe tener exactamente 2 o 3 sets",
    );
  },
);


test(
  "rechaza un solo set",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "El partido debe tener exactamente 2 o 3 sets",
    );
  },
);


test(
  "rechaza cuatro sets",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            4,

          p2:
            6,
        },
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "El partido debe tener exactamente 2 o 3 sets",
    );
  },
);


test(
  "rechaza set que no es objeto",
  () => {
    const result =
      parseMatchScore([
        null,
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "El Set 1 no tiene un formato válido.",
    );
  },
);


test(
  "rechaza set representado como array",
  () => {
    const result =
      parseMatchScore([
        [
          6,
          4,
        ],
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "El Set 1 no tiene un formato válido.",
    );
  },
);


test(
  "rechaza game faltante",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,
        },
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "Completá correctamente los dos valores del Set 1.",
    );
  },
);


test(
  "rechaza set con marcador inválido",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            5,
        },
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "El Set 1 no es válido. Ejemplos: 6-4, 7-5 o 7-6.",
    );
  },
);


/*
  ============================================================
  REGLA DEL TERCER SET
  ============================================================
*/

test(
  "si quedan 1-1 exige tercer set",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            4,

          p2:
            6,
        },
      ]);

    assert.equal(
      result.error,
      "Si cada jugador ganó un set, tenés que cargar el tercer set.",
    );
  },
);


test(
  "rechaza tercer set cuando P1 ya ganó los dos primeros",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            6,

          p2:
            2,
        },
        {
          p1:
            3,

          p2:
            6,
        },
      ]);

    assert.equal(
      result.error,
      "Si un jugador ganó los dos primeros sets no corresponde cargar un tercer set.",
    );
  },
);


test(
  "rechaza tercer set cuando P2 ya ganó los dos primeros",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            3,

          p2:
            6,
        },
        {
          p1:
            5,

          p2:
            7,
        },
        {
          p1:
            6,

          p2:
            4,
        },
      ]);

    assert.equal(
      result.error,
      "Si un jugador ganó los dos primeros sets no corresponde cargar un tercer set.",
    );
  },
);


/*
  ============================================================
  NORMALIZACIÓN
  ============================================================
*/

test(
  "normaliza strings numéricos a numbers",
  () => {
    const result =
      parseMatchScore([
        {
          p1:
            "6",

          p2:
            "4",
        },
        {
          p1:
            "7",

          p2:
            "5",
        },
      ]);

    assert.deepEqual(
      result.normalizedScore,
      [
        {
          p1:
            6,

          p2:
            4,
        },
        {
          p1:
            7,

          p2:
            5,
        },
      ],
    );
  },
);


/*
  ============================================================
  STRICT
  ============================================================
*/

test(
  "validateMatchScore devuelve score válido",
  () => {
    const result =
      validateMatchScore([
        {
          p1:
            6,

          p2:
            0,
        },
        {
          p1:
            6,

          p2:
            1,
        },
      ]);

    assert.equal(
      result.winnerSide,
      1,
    );
  },
);


test(
  "validateMatchScore lanza MatchScoreError",
  () => {
    assert.throws(
      () =>
        validateMatchScore([
          {
            p1:
              6,

            p2:
              5,
          },
          {
            p1:
              6,

            p2:
              4,
          },
        ]),
      (error) => {
        assert.ok(
          error instanceof
            MatchScoreError,
        );

        assert.equal(
          error.reason,
          "invalid_score",
        );

        return true;
      },
    );
  },
);