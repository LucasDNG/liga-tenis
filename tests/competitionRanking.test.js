import test from "node:test";
import assert from "node:assert/strict";

import {
  getCompetitionPercentileFromPosition,
  getOfficialCompetitionPosition,
} from "../src/services/competitionRanking.service.js";

import {
  validatePlacementEvidenceSequence,
} from "../src/services/placementEvidence.service.js";


test(
  "posición 1 de 10 equivale a percentil 100",
  () => {
    assert.equal(
      getCompetitionPercentileFromPosition(
        1,
        10,
      ),
      100,
    );
  },
);


test(
  "posición 10 de 10 equivale a percentil 0",
  () => {
    assert.equal(
      getCompetitionPercentileFromPosition(
        10,
        10,
      ),
      0,
    );
  },
);


test(
  "posición intermedia usa fórmula oficial",
  () => {
    assert.equal(
      getCompetitionPercentileFromPosition(
        5,
        9,
      ),
      50,
    );
  },
);


test(
  "obtiene posición oficial dentro del ranking recibido",
  () => {
    const ranking = [
      {
        id: 10,
        official_position: 1,
      },
      {
        id: 20,
        official_position: 2,
      },
    ];

    assert.equal(
      getOfficialCompetitionPosition(
        20,
        ranking,
      ),
      2,
    );
  },
);


test(
  "jugador ausente no tiene posición oficial",
  () => {
    assert.equal(
      getOfficialCompetitionPosition(
        99,
        [
          {
            id: 10,
            official_position: 1,
          },
        ],
      ),
      null,
    );
  },
);


test(
  "cinco nivelatorios de singles forman secuencia válida",
  () => {
    const evidence = [
      1,
      2,
      3,
      4,
      5,
    ].map(
      (number) => ({
        competition_id: 1,
        placement_match_number:
          number,
      }),
    );

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        1,
      ),
      true,
    );
  },
);


test(
  "cinco nivelatorios de dobles forman otra secuencia válida",
  () => {
    const evidence = [
      1,
      2,
      3,
      4,
      5,
    ].map(
      (number) => ({
        competition_id: 2,
        placement_match_number:
          number,
      }),
    );

    assert.equal(
      validatePlacementEvidenceSequence(
        evidence,
        2,
      ),
      true,
    );
  },
);


test(
  "no permite mezclar evidencia singles y dobles",
  () => {
    assert.throws(
      () =>
        validatePlacementEvidenceSequence(
          [
            {
              competition_id: 1,
              placement_match_number: 1,
            },
            {
              competition_id: 2,
              placement_match_number: 2,
            },
          ],
          1,
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
  "cada competición puede tener su propio nivelatorio número 1",
  () => {
    const singles = [
      {
        competition_id: 1,
        placement_match_number: 1,
      },
    ];

    const doubles = [
      {
        competition_id: 2,
        placement_match_number: 1,
      },
    ];

    assert.equal(
      validatePlacementEvidenceSequence(
        singles,
        1,
      ),
      true,
    );

    assert.equal(
      validatePlacementEvidenceSequence(
        doubles,
        2,
      ),
      true,
    );
  },
);