import test from "node:test";
import assert from "node:assert/strict";

import {
  getOfficialPositionPercentile,
} from "../src/services/placementReference.service.js";

import {
  validatePlacementEvidenceSequence,
} from "../src/services/placementEvidence.service.js";


const assertApproximatelyEqual = (
  actual,
  expected,
  tolerance = 0.000001,
) => {
  assert.ok(
    Math.abs(
      actual - expected,
    ) <= tolerance,
    `Esperado aproximadamente ${expected}, recibido ${actual}`,
  );
};


test(
  "ranking de un solo oficial da 100%",
  () => {
    assert.equal(
      getOfficialPositionPercentile({
        position: 1,
        officialPlayerCount: 1,
      }),
      100,
    );
  },
);


test(
  "#1 de 20 oficiales da 100%",
  () => {
    assert.equal(
      getOfficialPositionPercentile({
        position: 1,
        officialPlayerCount: 20,
      }),
      100,
    );
  },
);


test(
  "#20 de 20 oficiales da 0%",
  () => {
    assert.equal(
      getOfficialPositionPercentile({
        position: 20,
        officialPlayerCount: 20,
      }),
      0,
    );
  },
);


test(
  "#10 de 20 usa el percentil acordado",
  () => {
    const percentile =
      getOfficialPositionPercentile({
        position: 10,
        officialPlayerCount: 20,
      });

    assertApproximatelyEqual(
      percentile,
      52.63157894736842,
    );
  },
);


test(
  "singles puede tener secuencia 1 a 5",
  () => {
    const evidence =
      [1, 2, 3, 4, 5].map(
        (number) => ({
          competition_id: 10,
          placement_match_number:
            number,
        }),
      );

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        10,
      ),
      true,
    );
  },
);


test(
  "dobles puede tener otra secuencia 1 a 5",
  () => {
    const evidence =
      [1, 2, 3, 4, 5].map(
        (number) => ({
          competition_id: 20,
          placement_match_number:
            number,
        }),
      );

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        20,
      ),
      true,
    );
  },
);


test(
  "no acepta evidencia de otra competición",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            {
              competition_id: 10,
              placement_match_number: 1,
            },
            {
              competition_id: 20,
              placement_match_number: 2,
            },
          ],
          10,
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_competition_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "no acepta huecos en la secuencia",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            {
              competition_id: 10,
              placement_match_number: 1,
            },
            {
              competition_id: 10,
              placement_match_number: 3,
            },
          ],
          10,
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_sequence_gap",
        );

        return true;
      },
    );
  },
);