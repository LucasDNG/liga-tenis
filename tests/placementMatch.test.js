import test from "node:test";
import assert from "node:assert/strict";

import {
  PlacementMatchError,
  isPlacementPlayer,
  getPlacementStateBeforeMatch,
  recordPlayerPlacementResult,
  recordPlacementMatchResult,
  getCurrentPlacementLevel,
} from "../src/services/placementMatch.service.js";


/*
  ============================================================
  LA RED
  TESTS DEL ORQUESTADOR DE NIVELATORIOS
  ============================================================

  Esta suite NO toca Neon.

  Verifica:

  - jugador provisional / oficial;
  - sincronización matches_played <-> evidencia;
  - siguiente partido 1/5 ... 5/5;
  - partidos #1 a #4 sin Elo final;
  - quinto partido con placement completo;
  - target position;
  - target Elo;
  - referencia congelada;
  - provisional vs provisional;
  - ganador válido;
  - contexto válido;
  - bloqueo de inconsistencias;
  - nivel actual del provisional.
  ============================================================
*/


const createQueuedClient = (
  responses = [],
) => {
  const queue =
    [...responses];

  const calls =
    [];

  return {
    calls,

    async query(
      sql,
      params = [],
    ) {
      calls.push({
        sql:
          String(sql),

        params,
      });

      if (
        queue.length === 0
      ) {
        throw new Error(
          `Mock PostgreSQL sin respuesta configurada para query #${calls.length}.`,
        );
      }

      const next =
        queue.shift();

      if (
        next instanceof Error
      ) {
        throw next;
      }

      if (
        typeof next ===
        "function"
      ) {
        return next({
          sql:
            String(sql),

          params,

          calls,
        });
      }

      return next;
    },
  };
};


const player = ({
  id,
  matchesPlayed = 0,
  rating = 0,
  firstName = "Jugador",
  lastName = "Prueba",
  city = "San Pedro",
  gender = "male",
} = {}) => ({
  id,

  name:
    `${firstName} ${lastName}`,

  first_name:
    firstName,

  last_name:
    lastName,

  matches_played:
    matchesPlayed,

  rating,

  city,

  gender,

  role:
    "player",

  verification_status:
    "verified",
});


const evidenceRow = ({
  id = 1,
  matchId = 100,
  userId = 10,
  opponentId = 20,
  placementMatchNumber = 1,
  won = true,
  percentile = 50,
  referenceType = "official",
  opponentRankPosition = 10,
  officialPlayerCount = 20,
} = {}) => ({
  id,

  match_id:
    matchId,

  user_id:
    userId,

  opponent_id:
    opponentId,

  placement_match_number:
    placementMatchNumber,

  won,

  opponent_percentile_at_match:
    percentile,

  opponent_reference_type:
    referenceType,

  opponent_rank_position_at_match:
    opponentRankPosition,

  official_player_count_at_match:
    officialPlayerCount,

  created_at:
    "2026-09-08T12:00:00.000Z",
});


const createOfficialRanking = (
  count = 20,
) =>
  Array.from(
    {
      length:
        count,
    },
    (
      _,
      index,
    ) => ({
      id:
        1000 +
        index,

      first_name:
        `Jugador${index + 1}`,

      last_name:
        "Oficial",

      rating:
        2000 -
        index * 50,

      matches_played:
        10,

      official_position:
        index + 1,

      position:
        index + 1,

      rank_position:
        index + 1,
    }),
  );


const preparedReference = ({
  playerId,
  opponentId,
  matchNumber,
  percentile,
  referenceType = "official",
  opponentRankPosition = null,
  officialCount = 20,
} = {}) => ({
  applies:
    true,

  player_id:
    playerId,

  opponent_id:
    opponentId,

  placement_match_number:
    matchNumber,

  matches_before:
    matchNumber - 1,

  opponent_reference: {
    opponent_id:
      opponentId,

    opponent_reference_type:
      referenceType,

    opponent_percentile_at_match:
      percentile,

    opponent_rank_position_at_match:
      opponentRankPosition,

    official_player_count_at_match:
      officialCount,

    provisional:
      referenceType ===
      "provisional",
  },
});


/*
  ============================================================
  ESTADO PROVISIONAL
  ============================================================
*/

test(
  "jugador con 0 partidos está en placement",
  () => {
    assert.equal(
      isPlacementPlayer(
        player({
          id:
            1,

          matchesPlayed:
            0,
        }),
      ),
      true,
    );
  },
);


test(
  "jugador con 4 partidos sigue en placement",
  () => {
    assert.equal(
      isPlacementPlayer(
        player({
          id:
            1,

          matchesPlayed:
            4,
        }),
      ),
      true,
    );
  },
);


test(
  "jugador con 5 partidos ya es oficial",
  () => {
    assert.equal(
      isPlacementPlayer(
        player({
          id:
            1,

          matchesPlayed:
            5,

          rating:
            1400,
        }),
      ),
      false,
    );
  },
);


/*
  ============================================================
  ESTADO PRE-PARTIDO
  ============================================================
*/

test(
  "nuevo jugador prepara nivelatorio 1/5",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount:
            0,

          rows:
            [],
        },
      ]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        player({
          id:
            10,

          matchesPlayed:
            0,
        }),
      );

    assert.equal(
      result.user_id,
      10,
    );

    assert.equal(
      result.provisional,
      true,
    );

    assert.equal(
      result.matches_before,
      0,
    );

    assert.equal(
      result.next_match_number,
      1,
    );

    assert.equal(
      result.evidence_count,
      0,
    );
  },
);


test(
  "jugador con cuatro evidencias prepara nivelatorio 5/5",
  async () => {
    const rows = [
      evidenceRow({
        id:
          1,

        matchId:
          101,

        placementMatchNumber:
          1,
      }),

      evidenceRow({
        id:
          2,

        matchId:
          102,

        placementMatchNumber:
          2,
      }),

      evidenceRow({
        id:
          3,

        matchId:
          103,

        placementMatchNumber:
          3,
      }),

      evidenceRow({
        id:
          4,

        matchId:
          104,

        placementMatchNumber:
          4,
      }),
    ];

    const client =
      createQueuedClient([
        {
          rowCount:
            4,

          rows,
        },
      ]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        player({
          id:
            10,

          matchesPlayed:
            4,
        }),
      );

    assert.equal(
      result.next_match_number,
      5,
    );

    assert.equal(
      result.evidence_count,
      4,
    );
  },
);


test(
  "detecta matches_played y evidencia desincronizados",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            evidenceRow({
              placementMatchNumber:
                1,
            }),
          ],
        },
      ]);

    await assert.rejects(
      () =>
        getPlacementStateBeforeMatch(
          client,
          player({
            id:
              10,

            matchesPlayed:
              2,
          }),
        ),
      (error) => {
        assert.ok(
          error instanceof
            PlacementMatchError,
        );

        assert.equal(
          error.reason,
          "placement_evidence_out_of_sync",
        );

        return true;
      },
    );
  },
);


test(
  "jugador oficial no intenta crear sexto nivelatorio",
  async () => {
    const client =
      createQueuedClient([]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        player({
          id:
            10,

          matchesPlayed:
            5,

          rating:
            1400,
        }),
      );

    assert.equal(
      result.provisional,
      false,
    );

    assert.equal(
      result.next_match_number,
      null,
    );

    assert.equal(
      result.evidence_count,
      null,
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


/*
  ============================================================
  NIVEL ACTUAL
  ============================================================
*/

test(
  "getCurrentPlacementLevel devuelve 0/5 para jugador sin evidencia",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount:
            0,

          rows:
            [],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
      );

    assert.equal(
      result.user_id,
      10,
    );

    assert.equal(
      result.matches_played,
      0,
    );

    assert.equal(
      result.matches_remaining,
      5,
    );

    assert.equal(
      result.wins,
      0,
    );

    assert.equal(
      result.losses,
      0,
    );

    assert.equal(
      result.placement_percentile,
      0,
    );

    assert.equal(
      result.completed,
      false,
    );
  },
);


test(
  "getCurrentPlacementLevel calcula 1 victoria contra 50%",
  async () => {
    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            evidenceRow({
              id:
                1,

              matchId:
                101,

              userId:
                10,

              placementMatchNumber:
                1,

              won:
                true,

              percentile:
                50,
            }),
          ],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
      );

    assert.equal(
      result.matches_played,
      1,
    );

    assert.equal(
      result.matches_remaining,
      4,
    );

    assert.equal(
      result.wins,
      1,
    );

    assert.equal(
      result.losses,
      0,
    );

    assert.equal(
      result.demonstrated_level,
      58,
    );

    assert.equal(
      result.win_factor,
      0.65,
    );

    assert.equal(
      result.placement_percentile,
      37.7,
    );
  },
);


/*
  ============================================================
  NIVELATORIO #1
  ============================================================
*/

test(
  "primer nivelatorio guarda evidencia y todavía no entrega Elo final",
  async () => {
    const stored =
      evidenceRow({
        id:
          1,

        matchId:
          500,

        userId:
          10,

        opponentId:
          20,

        placementMatchNumber:
          1,

        won:
          true,

        percentile:
          50,

        referenceType:
          "official",

        opponentRankPosition:
          10,

        officialPlayerCount:
          20,
      });

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            stored,
          ],
        },
      ]);

    const result =
      await recordPlayerPlacementResult(
        client,
        {
          matchId:
            500,

          player:
            player({
              id:
                10,

              matchesPlayed:
                0,

              rating:
                0,
            }),

          opponent:
            player({
              id:
                20,

              matchesPlayed:
                15,

              rating:
                1500,
            }),

          won:
            true,

          preparedContext:
            preparedReference({
              playerId:
                10,

              opponentId:
                20,

              matchNumber:
                1,

              percentile:
                50,

              referenceType:
                "official",

              opponentRankPosition:
                10,

              officialCount:
                20,
            }),

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.applies,
      true,
    );

    assert.equal(
      result.completed,
      false,
    );

    assert.equal(
      result.placement_match_number,
      1,
    );

    assert.equal(
      result.matches_after,
      1,
    );

    assert.equal(
      result.wins,
      1,
    );

    assert.equal(
      result.losses,
      0,
    );

    assert.equal(
      result.placement_percentile,
      37.7,
    );

    assert.equal(
      result.demonstrated_level,
      58,
    );

    assert.equal(
      result.target_position,
      null,
    );

    assert.equal(
      result.target_elo,
      null,
    );

    assert.deepEqual(
      client.calls[0].params,
      [
        500,
        10,
        20,
        1,
        true,
        50,
        "official",
        10,
        20,
      ],
    );
  },
);


/*
  ============================================================
  NIVELATORIO #4
  ============================================================
*/

test(
  "cuarto nivelatorio sigue sin asignar Elo oficial",
  async () => {
    const rows = [
      evidenceRow({
        id:
          1,

        matchId:
          501,

        userId:
          10,

        placementMatchNumber:
          1,

        won:
          true,

        percentile:
          40,
      }),

      evidenceRow({
        id:
          2,

        matchId:
          502,

        userId:
          10,

        placementMatchNumber:
          2,

        won:
          true,

        percentile:
          50,
      }),

      evidenceRow({
        id:
          3,

        matchId:
          503,

        userId:
          10,

        placementMatchNumber:
          3,

        won:
          false,

        percentile:
          80,
      }),

      evidenceRow({
        id:
          4,

        matchId:
          504,

        userId:
          10,

        placementMatchNumber:
          4,

        won:
          false,

        percentile:
          90,
      }),
    ];

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            rows[3],
          ],
        },

        {
          rowCount:
            4,

          rows,
        },

        {
          rowCount:
            4,

          rows,
        },
      ]);

    const result =
      await recordPlayerPlacementResult(
        client,
        {
          matchId:
            504,

          player:
            player({
              id:
                10,

              matchesPlayed:
                3,
            }),

          opponent:
            player({
              id:
                20,

              matchesPlayed:
                20,

              rating:
                1700,
            }),

          won:
            false,

          preparedContext:
            preparedReference({
              playerId:
                10,

              opponentId:
                20,

              matchNumber:
                4,

              percentile:
                90,

              referenceType:
                "official",

              opponentRankPosition:
                3,
            }),

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.completed,
      false,
    );

    assert.equal(
      result.matches_after,
      4,
    );

    assert.equal(
      result.wins,
      2,
    );

    assert.equal(
      result.losses,
      2,
    );

    assert.equal(
      result.target_position,
      null,
    );

    assert.equal(
      result.target_elo,
      null,
    );
  },
);


/*
  ============================================================
  NIVELATORIO #5
  ============================================================
*/

test(
  "quinto nivelatorio completa placement y asigna Elo objetivo",
  async () => {
    const rows = [
      evidenceRow({
        id:
          1,

        matchId:
          601,

        userId:
          10,

        placementMatchNumber:
          1,

        won:
          true,

        percentile:
          50,
      }),

      evidenceRow({
        id:
          2,

        matchId:
          602,

        userId:
          10,

        placementMatchNumber:
          2,

        won:
          false,

        percentile:
          90,
      }),

      evidenceRow({
        id:
          3,

        matchId:
          603,

        userId:
          10,

        placementMatchNumber:
          3,

        won:
          false,

        percentile:
          80,
      }),

      evidenceRow({
        id:
          4,

        matchId:
          604,

        userId:
          10,

        placementMatchNumber:
          4,

        won:
          false,

        percentile:
          70,
      }),

      evidenceRow({
        id:
          5,

        matchId:
          605,

        userId:
          10,

        placementMatchNumber:
          5,

        won:
          false,

        percentile:
          60,
      }),
    ];

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            rows[4],
          ],
        },

        {
          rowCount:
            5,

          rows,
        },

        {
          rowCount:
            5,

          rows,
        },
      ]);

    const result =
      await recordPlayerPlacementResult(
        client,
        {
          matchId:
            605,

          player:
            player({
              id:
                10,

              matchesPlayed:
                4,

              rating:
                0,
            }),

          opponent:
            player({
              id:
                20,

              matchesPlayed:
                20,

              rating:
                1600,
            }),

          won:
            false,

          preparedContext:
            preparedReference({
              playerId:
                10,

              opponentId:
                20,

              matchNumber:
                5,

              percentile:
                60,

              referenceType:
                "official",

              opponentRankPosition:
                8,

              officialCount:
                20,
            }),

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.applies,
      true,
    );

    assert.equal(
      result.completed,
      true,
    );

    assert.equal(
      result.placement_match_number,
      5,
    );

    assert.equal(
      result.matches_after,
      5,
    );

    assert.equal(
      result.wins,
      1,
    );

    assert.equal(
      result.losses,
      4,
    );

    assert.equal(
      result.weighted_victory_percentile,
      50,
    );

    assert.equal(
      result.demonstrated_level,
      58,
    );

    assert.equal(
      result.win_factor,
      0.65,
    );

    assert.equal(
      result.placement_percentile,
      37.7,
    );

    assert.equal(
      result.target_position,
      13,
    );

    assert.equal(
      result.target_elo,
      1400,
    );

    assert.equal(
      result.official_player_count_before,
      20,
    );

    assert.equal(
      result.elo_reference_position,
      13,
    );

    assert.equal(
      result.elo_reference_rating,
      1400,
    );
  },
);


test(
  "quinto nivelatorio 0/5 termina debajo de todos",
  async () => {
    const rows =
      Array.from(
        {
          length:
            5,
        },
        (
          _,
          index,
        ) =>
          evidenceRow({
            id:
              index + 1,

            matchId:
              700 +
              index,

            userId:
              10,

            placementMatchNumber:
              index + 1,

            won:
              false,

            percentile:
              90 -
              index * 10,
          }),
      );

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            rows[4],
          ],
        },

        {
          rowCount:
            5,

          rows,
        },

        {
          rowCount:
            5,

          rows,
        },
      ]);

    const result =
      await recordPlayerPlacementResult(
        client,
        {
          matchId:
            rows[4]
              .match_id,

          player:
            player({
              id:
                10,

              matchesPlayed:
                4,
            }),

          opponent:
            player({
              id:
                20,

              matchesPlayed:
                30,

              rating:
                1900,
            }),

          won:
            false,

          preparedContext:
            preparedReference({
              playerId:
                10,

              opponentId:
                20,

              matchNumber:
                5,

              percentile:
                100,

              referenceType:
                "official",

              opponentRankPosition:
                1,
            }),

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.placement_percentile,
      0,
    );

    assert.equal(
      result.target_position,
      21,
    );

    assert.equal(
      result.target_elo,
      1050,
    );
  },
);


/*
  ============================================================
  RANKING PRE-PARTIDO
  ============================================================
*/

test(
  "quinto nivelatorio falla si el jugador ya aparece entre oficiales",
  async () => {
    const rows =
      Array.from(
        {
          length:
            5,
        },
        (
          _,
          index,
        ) =>
          evidenceRow({
            id:
              index + 1,

            matchId:
              800 +
              index,

            userId:
              10,

            placementMatchNumber:
              index + 1,

            won:
              index ===
              0,

            percentile:
              50,
          }),
      );

    const ranking =
      createOfficialRanking(
        20,
      );

    ranking.push({
      id:
        10,

      rating:
        1500,

      position:
        21,

      official_position:
        21,
    });

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            rows[4],
          ],
        },

        {
          rowCount:
            5,

          rows,
        },

        {
          rowCount:
            5,

          rows,
        },
      ]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId:
              rows[4]
                .match_id,

            player:
              player({
                id:
                  10,

                matchesPlayed:
                  4,
              }),

            opponent:
              player({
                id:
                  20,

                matchesPlayed:
                  20,

                rating:
                  1500,
              }),

            won:
              false,

            preparedContext:
              preparedReference({
                playerId:
                  10,

                opponentId:
                  20,

                matchNumber:
                  5,

                percentile:
                  50,
              }),

            officialRankingBefore:
              ranking,
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_player_already_official",
        );

        return true;
      },
    );
  },
);


/*
  ============================================================
  CONTEXTO PRE-PARTIDO
  ============================================================
*/

test(
  "rechaza contexto correspondiente a otro jugador",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId:
              900,

            player:
              player({
                id:
                  10,

                matchesPlayed:
                  0,
              }),

            opponent:
              player({
                id:
                  20,

                matchesPlayed:
                  10,

                rating:
                  1500,
              }),

            won:
              true,

            preparedContext:
              preparedReference({
                playerId:
                  99,

                opponentId:
                  20,

                matchNumber:
                  1,

                percentile:
                  50,
              }),

            officialRankingBefore:
              [],
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_context_player_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza contexto correspondiente a otro rival",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId:
              900,

            player:
              player({
                id:
                  10,

                matchesPlayed:
                  0,
              }),

            opponent:
              player({
                id:
                  20,

                matchesPlayed:
                  10,

                rating:
                  1500,
              }),

            won:
              true,

            preparedContext:
              preparedReference({
                playerId:
                  10,

                opponentId:
                  99,

                matchNumber:
                  1,

                percentile:
                  50,
              }),

            officialRankingBefore:
              [],
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_context_opponent_mismatch",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza cambio del número de nivelatorio entre preparación y confirmación",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId:
              900,

            player:
              player({
                id:
                  10,

                matchesPlayed:
                  2,
              }),

            opponent:
              player({
                id:
                  20,

                matchesPlayed:
                  10,

                rating:
                  1500,
              }),

            won:
              true,

            preparedContext:
              preparedReference({
                playerId:
                  10,

                opponentId:
                  20,

                matchNumber:
                  2,

                percentile:
                  50,
              }),

            officialRankingBefore:
              [],
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_match_number_changed",
        );

        return true;
      },
    );
  },
);


/*
  ============================================================
  PROVISIONAL VS PROVISIONAL
  ============================================================
*/

test(
  "provisional vs provisional usa exactamente la referencia congelada pre-partido",
  async () => {
    const p1Stored =
      evidenceRow({
        id:
          1,

        matchId:
          1000,

        userId:
          10,

        opponentId:
          20,

        placementMatchNumber:
          1,

        won:
          true,

        percentile:
          68,

        referenceType:
          "provisional",

        opponentRankPosition:
          null,

        officialPlayerCount:
          20,
      });

    const p2Stored =
      evidenceRow({
        id:
          2,

        matchId:
          1000,

        userId:
          20,

        opponentId:
          10,

        placementMatchNumber:
          1,

        won:
          false,

        percentile:
          0,

        referenceType:
          "provisional",

        opponentRankPosition:
          null,

        officialPlayerCount:
          20,
      });

    const client =
      createQueuedClient([
        {
          rowCount:
            1,

          rows: [
            p1Stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            p1Stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            p1Stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            p2Stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            p2Stored,
          ],
        },

        {
          rowCount:
            1,

          rows: [
            p2Stored,
          ],
        },
      ]);

    const result =
      await recordPlacementMatchResult(
        client,
        {
          matchId:
            1000,

          player1:
            player({
              id:
                10,

              matchesPlayed:
                0,

              rating:
                0,

              firstName:
                "Lucas",
            }),

          player2:
            player({
              id:
                20,

              matchesPlayed:
                0,

              rating:
                0,

              firstName:
                "Mateo",
            }),

          winnerId:
            10,

          preparedContext: {
            player1:
              preparedReference({
                playerId:
                  10,

                opponentId:
                  20,

                matchNumber:
                  1,

                percentile:
                  68,

                referenceType:
                  "provisional",
              }),

            player2:
              preparedReference({
                playerId:
                  20,

                opponentId:
                  10,

                matchNumber:
                  1,

                percentile:
                  0,

                referenceType:
                  "provisional",
              }),

            has_placement_player:
              true,
          },

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.has_placement_player,
      true,
    );

    assert.equal(
      result.winner_id,
      10,
    );

    assert.equal(
      result.player1.wins,
      1,
    );

    assert.equal(
      result.player1.losses,
      0,
    );

    assert.equal(
      result.player1
        .placement_percentile,
      49.4,
    );

    assert.equal(
      result.player2.wins,
      0,
    );

    assert.equal(
      result.player2.losses,
      1,
    );

    assert.equal(
      result.player2
        .placement_percentile,
      0,
    );

    assert.equal(
      client.calls[0]
        .params[5],
      68,
    );

    assert.equal(
      client.calls[0]
        .params[6],
      "provisional",
    );

    assert.equal(
      client.calls[3]
        .params[5],
      0,
    );

    assert.equal(
      client.calls[3]
        .params[6],
      "provisional",
    );
  },
);


/*
  ============================================================
  GANADOR
  ============================================================
*/

test(
  "recordPlacementMatchResult rechaza ganador ajeno al partido",
  async () => {
    const client =
      createQueuedClient([]);

    await assert.rejects(
      () =>
        recordPlacementMatchResult(
          client,
          {
            matchId:
              1100,

            player1:
              player({
                id:
                  10,
              }),

            player2:
              player({
                id:
                  20,
              }),

            winnerId:
              99,

            preparedContext: {
              player1:
                {},

              player2:
                {},
            },

            officialRankingBefore:
              [],
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "winner_not_in_match",
        );

        return true;
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


/*
  ============================================================
  DOS OFICIALES
  ============================================================
*/

test(
  "partido entre dos oficiales no genera placement",
  async () => {
    const client =
      createQueuedClient([]);

    const result =
      await recordPlacementMatchResult(
        client,
        {
          matchId:
            1200,

          player1:
            player({
              id:
                10,

              matchesPlayed:
                20,

              rating:
                1600,
            }),

          player2:
            player({
              id:
                20,

              matchesPlayed:
                30,

              rating:
                1700,
            }),

          winnerId:
            20,

          preparedContext: {
            player1: {
              applies:
                false,
            },

            player2: {
              applies:
                false,
            },

            has_placement_player:
              false,
          },

          officialRankingBefore:
            createOfficialRanking(
              20,
            ),
        },
      );

    assert.equal(
      result.has_placement_player,
      false,
    );

    assert.equal(
      result.player1.applies,
      false,
    );

    assert.equal(
      result.player2.applies,
      false,
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


/*
  ============================================================
  EVIDENCIA POST-INSERT
  ============================================================
*/

test(
  "falla si después de guardar no coincide la cantidad de evidencias",
  async () => {
    /*
      El jugador tenía 1 partido antes.

      Estamos intentando procesar su
      segundo nivelatorio.

      El INSERT de #2 funciona.

      Pero al leer el historial completo,
      simulamos que PostgreSQL devuelve
      solamente la evidencia #1.

      La secuencia [1] es válida.

      Sin embargo:

        esperado = 2 evidencias
        recibido = 1 evidencia

      Entonces debemos llegar específicamente
      a placement_evidence_count_mismatch.
    */

    const insertedSecond =
      evidenceRow({
        id:
          2,

        matchId:
          1300,

        userId:
          10,

        opponentId:
          20,

        placementMatchNumber:
          2,

        won:
          true,

        percentile:
          50,
      });

    const existingFirst =
      evidenceRow({
        id:
          1,

        matchId:
          1299,

        userId:
          10,

        opponentId:
          30,

        placementMatchNumber:
          1,

        won:
          false,

        percentile:
          70,
      });

    const client =
      createQueuedClient([
        /*
          INSERT de la evidencia #2.
        */
        {
          rowCount:
            1,

          rows: [
            insertedSecond,
          ],
        },

        /*
          Lectura posterior inconsistente:

          devuelve solamente #1.

          La secuencia es válida,
          así que validatePlacementEvidenceSequence
          NO debe cortar antes.
        */
        {
          rowCount:
            1,

          rows: [
            existingFirst,
          ],
        },
      ]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId:
              1300,

            player:
              player({
                id:
                  10,

                matchesPlayed:
                  1,
              }),

            opponent:
              player({
                id:
                  20,

                matchesPlayed:
                  10,

                rating:
                  1500,
              }),

            won:
              true,

            preparedContext:
              preparedReference({
                playerId:
                  10,

                opponentId:
                  20,

                matchNumber:
                  2,

                percentile:
                  50,
              }),

            officialRankingBefore:
              [],
          },
        ),
      (error) => {
        assert.equal(
          error.reason,
          "placement_evidence_count_mismatch",
        );

        assert.equal(
          error.details
            .placement_match_number,
          2,
        );

        assert.equal(
          error.details
            .evidence_count,
          1,
        );

        return true;
      },
    );

    assert.equal(
      client.calls.length,
      2,
    );
  },
);