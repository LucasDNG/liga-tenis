import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCompetitionFormat,
  normalizeCompetitionGender,
} from "../src/services/competition.service.js";


const combinations = [
  {
    format:
      "singles",

    gender:
      "male",
  },

  {
    format:
      "singles",

    gender:
      "female",
  },

  {
    format:
      "doubles",

    gender:
      "male",
  },

  {
    format:
      "doubles",

    gender:
      "female",
  },
];


test(
  "existen exactamente cuatro identidades de ranking soportadas",
  () => {
    assert.equal(
      combinations.length,
      4,
    );

    const identities =
      new Set(
        combinations.map(
          (
            item,
          ) =>
            `${item.format}:${item.gender}`,
        ),
      );

    assert.equal(
      identities.size,
      4,
    );
  },
);


for (
  const combination of
  combinations
) {
  test(
    `ranking válido ${combination.format} ${combination.gender}`,
    () => {
      assert.equal(
        normalizeCompetitionFormat(
          combination.format,
        ),
        combination.format,
      );

      assert.equal(
        normalizeCompetitionGender(
          combination.gender,
        ),
        combination.gender,
      );
    },
  );
}


test(
  "no acepta formato fuera de singles/doubles",
  () => {
    assert.throws(
      () =>
        normalizeCompetitionFormat(
          "padel",
        ),
    );
  },
);


test(
  "no acepta género mixed",
  () => {
    assert.throws(
      () =>
        normalizeCompetitionGender(
          "mixed",
        ),
    );
  },
);