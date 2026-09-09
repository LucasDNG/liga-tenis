import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCompetitivePositions,
  buildActivityChallengeWindow,
  getOfficialPositionFromRanking,
  getVirtualPositionFromRanking,
} from "../src/services/challengeEligibility.service.js";


const officialRanking = [
  {
    id: 1,
    competition_id: 100,
    matches_played: 10,
    official_position: 1,
  },
  {
    id: 2,
    competition_id: 100,
    matches_played: 8,
    official_position: 2,
  },
  {
    id: 3,
    competition_id: 100,
    matches_played: 9,
    official_position: 3,
  },
  {
    id: 4,
    competition_id: 100,
    matches_played: 12,
    official_position: 4,
  },
  {
    id: 5,
    competition_id: 100,
    matches_played: 11,
    official_position: 5,
  },
];


const players =
  officialRanking.map(
    (player) => ({
      ...player,

      rating:
        1600 -
        (
          player.official_position *
          20
        ),

      provisional: false,

      first_name:
        `Jugador${player.id}`,

      last_name:
        "Test",
    }),
  );


test(
  "oficial conserva posición dentro de su competición",
  () => {
    assert.equal(
      getOfficialPositionFromRanking(
        players[3],
        officialRanking,
      ),
      4,
    );
  },
);


test(
  "provisional usa placement para posición virtual",
  () => {
    const provisional = {
      id: 50,
      competition_id: 100,
      rating: 0,
      matches_played: 2,
      provisional: true,
    };

    const levels =
      new Map([
        [
          50,
          {
            placement_percentile: 75,
          },
        ],
      ]);

    const position =
      getVirtualPositionFromRanking(
        provisional,
        officialRanking,
        levels,
      );

    assert.ok(
      Number.isInteger(
        position,
      ),
    );

    assert.ok(
      position >= 2,
    );
  },
);


test(
  "construye posiciones competitivas solamente con ranking recibido",
  () => {
    const positions =
      buildCompetitivePositions(
        players,
        officialRanking,
        new Map(),
      );

    assert.equal(
      positions.get(1),
      1,
    );

    assert.equal(
      positions.get(5),
      5,
    );
  },
);


test(
  "ventana habilita hasta tres activos hacia arriba",
  () => {
    const challenger = {
      ...players[4],
      competition_id: 100,
    };

    const activity =
      new Map([
        [
          1,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          2,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          3,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          4,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          5,
          {
            active: true,
            inactive: false,
          },
        ],
      ]);

    const window =
      buildActivityChallengeWindow({
        challenger,
        players,
        officialRanking,

        placementLevelById:
          new Map(),

        activityById:
          activity,
      });

    assert.equal(
      window.activeCount,
      3,
    );

    assert.equal(
      window.eligibleIds.size,
      3,
    );

    assert.ok(
      window.eligibleIds.has(4),
    );

    assert.ok(
      window.eligibleIds.has(3),
    );

    assert.ok(
      window.eligibleIds.has(2),
    );

    assert.equal(
      window.eligibleIds.has(1),
      false,
    );
  },
);


test(
  "inactivo intermedio no consume cupo activo",
  () => {
    const challenger = {
      ...players[4],
      competition_id: 100,
    };

    const activity =
      new Map([
        [
          1,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          2,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          3,
          {
            active: true,
            inactive: false,
          },
        ],
        [
          4,
          {
            active: false,
            inactive: true,
          },
        ],
        [
          5,
          {
            active: true,
            inactive: false,
          },
        ],
      ]);

    const window =
      buildActivityChallengeWindow({
        challenger,
        players,
        officialRanking,

        placementLevelById:
          new Map(),

        activityById:
          activity,
      });

    assert.equal(
      window.activeCount,
      3,
    );

    assert.equal(
      window.eligibleIds.size,
      4,
    );

    assert.ok(
      window.inactiveIds.has(4),
    );

    assert.ok(
      window.activeIds.has(3),
    );

    assert.ok(
      window.activeIds.has(2),
    );

    assert.ok(
      window.activeIds.has(1),
    );
  },
);


test(
  "todos los candidatos pertenecen a la misma competición del desafiante",
  () => {
    const challenger = {
      ...players[4],
      competition_id: 100,
    };

    const activity =
      new Map(
        players.map(
          (player) => [
            player.id,
            {
              active: true,
              inactive: false,
            },
          ],
        ),
      );

    const window =
      buildActivityChallengeWindow({
        challenger,
        players,
        officialRanking,

        placementLevelById:
          new Map(),

        activityById:
          activity,
      });

    for (
      const playerId of
      window.eligibleIds
    ) {
      const player =
        players.find(
          (candidate) =>
            candidate.id ===
            playerId,
        );

      assert.equal(
        player.competition_id,
        100,
      );
    }
  },
);


test(
  "un provisional y un oficial pueden compartir posición competitiva sin romper el mapa",
  () => {
    const provisional = {
      id: 50,
      competition_id: 100,
      rating: 0,
      matches_played: 3,
      provisional: true,
      first_name: "Provisional",
      last_name: "Test",
    };

    const extendedPlayers = [
      ...players,
      provisional,
    ];

    const levels =
      new Map([
        [
          50,
          {
            matches_played: 3,
            wins: 2,
            losses: 1,
            placement_percentile: 75,
          },
        ],
      ]);

    const positions =
      buildCompetitivePositions(
        extendedPlayers,
        officialRanking,
        levels,
      );

    assert.equal(
      positions.size,
      6,
    );

    assert.ok(
      Number.isInteger(
        positions.get(50),
      ),
    );
  },
);