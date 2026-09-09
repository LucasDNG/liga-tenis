import test from "node:test";
import assert from "node:assert/strict";

import {
  PlacementMatchError,
  isPlacementPlayer,
  getPlacementStateBeforeMatch,
  preparePlacementMatchContext,
  recordPlayerPlacementResult,
  getCurrentPlacementLevel,
} from "../src/services/placementMatch.service.js";


const COMPETITION_ID = 1;
const OTHER_COMPETITION_ID = 2;


const makeClient = (
  responses = [],
) => {
  let index = 0;

  const calls = [];

  return {
    calls,

    async query(
      text,
      params = [],
    ) {
      calls.push({
        text,
        params,
      });

      if (
        index >=
        responses.length
      ) {
        throw new Error(
          `Mock PostgreSQL sin respuesta configurada para query #${index + 1}.`,
        );
      }

      const response =
        responses[index];

      index += 1;

      if (
        response instanceof Error
      ) {
        throw response;
      }

      if (
        typeof response ===
        "function"
      ) {
        return response(
          text,
          params,
          calls.length,
        );
      }

      return {
        rows:
          response.rows ?? [],
        rowCount:
          response.rowCount ??
          response.rows?.length ??
          0,
      };
    },
  };
};


const makePlayer = ({
  id = 10,
  competitionId =
    COMPETITION_ID,
  matchesPlayed = 0,
  rating = 0,
  firstName = "Juan",
  lastName = "Jugador",
} = {}) => ({
  id,
  competition_id:
    competitionId,
  matches_played:
    matchesPlayed,
  rating,
  first_name:
    firstName,
  last_name:
    lastName,
});


const makeEvidence = ({
  id = 1,
  matchId = 100,
  userId = 10,
  competitionId =
    COMPETITION_ID,
  opponentId = 20,
  number = 1,
  won = false,
  percentile = null,
  referenceType = "other",
} = {}) => ({
  id,
  match_id:
    matchId,
  user_id:
    userId,
  competition_id:
    competitionId,
  opponent_id:
    opponentId,
  placement_match_number:
    number,
  won,
  opponent_percentile_at_match:
    percentile,
  opponent_reference_type:
    referenceType,
  opponent_rank_position_at_match:
    null,
  official_player_count_at_match:
    null,
});


const makeCalculationEvidence = ({
  matchId = 100,
  competitionId =
    COMPETITION_ID,
  opponentId = 20,
  won = false,
  percentile = null,
  referenceType = "other",
} = {}) => ({
  match_id:
    matchId,
  competition_id:
    competitionId,
  opponent_id:
    opponentId,
  won,
  opponent_percentile_at_match:
    percentile,
  opponent_reference_type:
    referenceType,
});


const assertReason = (
  reason,
) => (
  error,
) => {
  assert.ok(
    error instanceof
      PlacementMatchError,
  );

  assert.equal(
    error.reason,
    reason,
  );

  return true;
};


test(
  "jugador con 0 partidos está en placement",
  () => {
    assert.equal(
      isPlacementPlayer(
        makePlayer({
          matchesPlayed: 0,
        }),
        COMPETITION_ID,
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
        makePlayer({
          matchesPlayed: 4,
        }),
        COMPETITION_ID,
      ),
      true,
    );
  },
);


test(
  "jugador con 5 partidos ya es oficial dentro de esa competición",
  () => {
    assert.equal(
      isPlacementPlayer(
        makePlayer({
          matchesPlayed: 5,
          rating: 1200,
        }),
        COMPETITION_ID,
      ),
      false,
    );
  },
);


test(
  "jugador con más de 5 partidos sigue siendo oficial",
  () => {
    assert.equal(
      isPlacementPlayer(
        makePlayer({
          matchesPlayed: 20,
          rating: 1350,
        }),
        COMPETITION_ID,
      ),
      false,
    );
  },
);


test(
  "isPlacementPlayer rechaza competición faltante",
  () => {
    assert.throws(
      () =>
        isPlacementPlayer(
          makePlayer(),
        ),
      assertReason(
        "invalid_integer",
      ),
    );
  },
);


test(
  "isPlacementPlayer rechaza jugador perteneciente a otra competición",
  () => {
    assert.throws(
      () =>
        isPlacementPlayer(
          makePlayer({
            competitionId:
              OTHER_COMPETITION_ID,
          }),
          COMPETITION_ID,
        ),
      assertReason(
        "player_competition_mismatch",
      ),
    );
  },
);


test(
  "getPlacementStateBeforeMatch devuelve estado oficial sin consultar evidencia",
  async () => {
    const client =
      makeClient([]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        makePlayer({
          matchesPlayed: 5,
          rating: 1200,
        }),
        COMPETITION_ID,
      );

    assert.deepEqual(
      result,
      {
        user_id: 10,
        competition_id:
          COMPETITION_ID,
        provisional: false,
        matches_before: 5,
        next_match_number:
          null,
        evidence_count:
          null,
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "getPlacementStateBeforeMatch devuelve primer nivelatorio",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
        },
      ]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        makePlayer({
          matchesPlayed: 0,
        }),
        COMPETITION_ID,
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

    assert.equal(
      result.competition_id,
      COMPETITION_ID,
    );
  },
);


test(
  "getPlacementStateBeforeMatch devuelve quinto nivelatorio",
  async () => {
    const rows = [
      makeEvidence({
        id: 1,
        matchId: 100,
        number: 1,
      }),
      makeEvidence({
        id: 2,
        matchId: 101,
        number: 2,
      }),
      makeEvidence({
        id: 3,
        matchId: 102,
        number: 3,
      }),
      makeEvidence({
        id: 4,
        matchId: 103,
        number: 4,
      }),
    ];

    const client =
      makeClient([
        {
          rows,
        },
      ]);

    const result =
      await getPlacementStateBeforeMatch(
        client,
        makePlayer({
          matchesPlayed: 4,
        }),
        COMPETITION_ID,
      );

    assert.equal(
      result.matches_before,
      4,
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
  "getPlacementStateBeforeMatch detecta evidencia desincronizada",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              number: 1,
            }),
          ],
        },
      ]);

    await assert.rejects(
      () =>
        getPlacementStateBeforeMatch(
          client,
          makePlayer({
            matchesPlayed: 2,
          }),
          COMPETITION_ID,
        ),
      assertReason(
        "placement_evidence_out_of_sync",
      ),
    );
  },
);


test(
  "preparePlacementMatchContext rechaza jugador contra sí mismo",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        preparePlacementMatchContext(
          client,
          {
            competitionId:
              COMPETITION_ID,
            player1:
              makePlayer({
                id: 10,
                matchesPlayed: 5,
                rating: 1200,
              }),
            player2:
              makePlayer({
                id: 10,
                matchesPlayed: 5,
                rating: 1200,
              }),
          },
        ),
      assertReason(
        "same_player",
      ),
    );
  },
);


test(
  "preparePlacementMatchContext entre dos oficiales no genera placement",
  async () => {
    const client =
      makeClient([]);

    const result =
      await preparePlacementMatchContext(
        client,
        {
          competitionId:
            COMPETITION_ID,
          player1:
            makePlayer({
              id: 10,
              matchesPlayed: 5,
              rating: 1200,
            }),
          player2:
            makePlayer({
              id: 20,
              matchesPlayed: 10,
              rating: 1300,
            }),
        },
      );

    assert.equal(
      result.competition_id,
      COMPETITION_ID,
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


test(
  "recordPlayerPlacementResult no aplica a jugador oficial",
  async () => {
    const client =
      makeClient([]);

    const result =
      await recordPlayerPlacementResult(
        client,
        {
          matchId: 100,
          competitionId:
            COMPETITION_ID,
          player:
            makePlayer({
              id: 10,
              matchesPlayed: 5,
              rating: 1200,
            }),
          opponent:
            makePlayer({
              id: 20,
              matchesPlayed: 5,
              rating: 1300,
            }),
          won: true,
          preparedContext:
            null,
          officialRankingBefore:
            [],
        },
      );

    assert.deepEqual(
      result,
      {
        applies: false,
        user_id: 10,
        competition_id:
          COMPETITION_ID,
        completed: false,
        placement:
          null,
      },
    );

    assert.equal(
      client.calls.length,
      0,
    );
  },
);


test(
  "recordPlayerPlacementResult exige contexto preparado para provisional",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 0,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext:
              null,
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "placement_context_missing",
      ),
    );
  },
);


test(
  "recordPlayerPlacementResult rechaza contexto de otro jugador",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 0,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext: {
              applies: true,
              player_id: 999,
              opponent_id: 20,
              competition_id:
                COMPETITION_ID,
              placement_match_number:
                1,
              opponent_reference: {
                opponent_percentile_at_match:
                  50,
                opponent_reference_type:
                  "official",
              },
            },
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "placement_context_player_mismatch",
      ),
    );
  },
);


test(
  "recordPlayerPlacementResult rechaza contexto de otro rival",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 0,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext: {
              applies: true,
              player_id: 10,
              opponent_id: 999,
              competition_id:
                COMPETITION_ID,
              placement_match_number:
                1,
              opponent_reference: {
                opponent_percentile_at_match:
                  50,
                opponent_reference_type:
                  "official",
              },
            },
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "placement_context_opponent_mismatch",
      ),
    );
  },
);


test(
  "recordPlayerPlacementResult rechaza contexto de otra competición",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 0,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext: {
              applies: true,
              player_id: 10,
              opponent_id: 20,
              competition_id:
                OTHER_COMPETITION_ID,
              placement_match_number:
                1,
              opponent_reference: {
                opponent_percentile_at_match:
                  50,
                opponent_reference_type:
                  "official",
              },
            },
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "placement_context_competition_mismatch",
      ),
    );
  },
);


test(
  "recordPlayerPlacementResult rechaza cambio del número de nivelatorio entre preparación y confirmación",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 1,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext: {
              applies: true,
              player_id: 10,
              opponent_id: 20,
              competition_id:
                COMPETITION_ID,

              /*
                El jugador ya tiene un partido,
                por lo que ahora debería confirmar
                el nivelatorio número 2.
              */
              placement_match_number:
                1,

              opponent_reference: {
                opponent_percentile_at_match:
                  50,
                opponent_reference_type:
                  "official",
              },
            },
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "placement_match_number_changed",
      ),
    );
  },
);


test(
  "recordPlayerPlacementResult exige referencia congelada del rival",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        recordPlayerPlacementResult(
          client,
          {
            matchId: 100,
            competitionId:
              COMPETITION_ID,
            player:
              makePlayer({
                id: 10,
                matchesPlayed: 0,
              }),
            opponent:
              makePlayer({
                id: 20,
                matchesPlayed: 5,
                rating: 1200,
              }),
            won: false,
            preparedContext: {
              applies: true,
              player_id: 10,
              opponent_id: 20,
              competition_id:
                COMPETITION_ID,
              placement_match_number:
                1,
              opponent_reference:
                null,
            },
            officialRankingBefore:
              [],
          },
        ),
      assertReason(
        "opponent_reference_missing",
      ),
    );
  },
);


test(
  "getCurrentPlacementLevel devuelve 0/5 para competición sin evidencia",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      result.user_id,
      10,
    );

    assert.equal(
      result.competition_id,
      COMPETITION_ID,
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

    assert.deepEqual(
      client.calls[0].params,
      [
        10,
        COMPETITION_ID,
      ],
    );
  },
);


test(
  "getCurrentPlacementLevel calcula una victoria contra 50%",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              won: true,
              percentile: 50,
              referenceType:
                "official",
            }),
          ],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
        COMPETITION_ID,
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
      result.completed,
      false,
    );

    assert.ok(
      result.placement_percentile >
        0,
    );

    assert.ok(
      result.placement_percentile <=
        100,
    );
  },
);


test(
  "getCurrentPlacementLevel no gana nivel por una derrota",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              won: false,
              percentile: 100,
              referenceType:
                "official",
            }),
          ],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      result.matches_played,
      1,
    );

    assert.equal(
      result.wins,
      0,
    );

    assert.equal(
      result.losses,
      1,
    );

    assert.equal(
      result.placement_percentile,
      0,
    );
  },
);


test(
  "getCurrentPlacementLevel completa placement con cinco evidencias",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            makeEvidence({
              id: 1,
              matchId: 100,
              number: 1,
              won: true,
              percentile: 80,
              referenceType:
                "official",
            }),
            makeEvidence({
              id: 2,
              matchId: 101,
              opponentId: 21,
              number: 2,
              won: false,
            }),
            makeEvidence({
              id: 3,
              matchId: 102,
              opponentId: 22,
              number: 3,
              won: true,
              percentile: 60,
              referenceType:
                "official",
            }),
            makeEvidence({
              id: 4,
              matchId: 103,
              opponentId: 23,
              number: 4,
              won: false,
            }),
            makeEvidence({
              id: 5,
              matchId: 104,
              opponentId: 24,
              number: 5,
              won: true,
              percentile: 70,
              referenceType:
                "official",
            }),
          ],
        },
      ]);

    const result =
      await getCurrentPlacementLevel(
        client,
        10,
        COMPETITION_ID,
      );

    assert.equal(
      result.matches_played,
      5,
    );

    assert.equal(
      result.matches_remaining,
      0,
    );

    assert.equal(
      result.wins,
      3,
    );

    assert.equal(
      result.losses,
      2,
    );

    assert.equal(
      result.completed,
      true,
    );

    assert.ok(
      result.placement_percentile >
        0,
    );
  },
);


test(
  "el mismo jugador puede estar 5/5 en singles y 0/5 en dobles",
  async () => {
    const singlesClient =
      makeClient([
        {
          rows: [
            makeEvidence({
              id: 1,
              matchId: 100,
              competitionId: 1,
              number: 1,
              won: true,
              percentile: 70,
            }),
            makeEvidence({
              id: 2,
              matchId: 101,
              competitionId: 1,
              number: 2,
            }),
            makeEvidence({
              id: 3,
              matchId: 102,
              competitionId: 1,
              number: 3,
            }),
            makeEvidence({
              id: 4,
              matchId: 103,
              competitionId: 1,
              number: 4,
            }),
            makeEvidence({
              id: 5,
              matchId: 104,
              competitionId: 1,
              number: 5,
            }),
          ],
        },
      ]);

    const doublesClient =
      makeClient([
        {
          rows: [],
        },
      ]);

    const singles =
      await getCurrentPlacementLevel(
        singlesClient,
        10,
        1,
      );

    const doubles =
      await getCurrentPlacementLevel(
        doublesClient,
        10,
        2,
      );

    assert.equal(
      singles.matches_played,
      5,
    );

    assert.equal(
      singles.completed,
      true,
    );

    assert.equal(
      doubles.matches_played,
      0,
    );

    assert.equal(
      doubles.completed,
      false,
    );

    assert.equal(
      singles.competition_id,
      1,
    );

    assert.equal(
      doubles.competition_id,
      2,
    );
  },
);


test(
  "getCurrentPlacementLevel rechaza userId inválido",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        getCurrentPlacementLevel(
          client,
          "abc",
          COMPETITION_ID,
        ),
      assertReason(
        "invalid_integer",
      ),
    );
  },
);


test(
  "getCurrentPlacementLevel rechaza competitionId inválido",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        getCurrentPlacementLevel(
          client,
          10,
          undefined,
        ),
      assertReason(
        "invalid_integer",
      ),
    );
  },
);


test(
  "placement de singles y dobles no mezcla evidencia",
  async () => {
    const singlesClient =
      makeClient([
        {
          rows: [
            makeEvidence({
              competitionId: 1,
              won: true,
              percentile: 80,
            }),
          ],
        },
      ]);

    const doublesClient =
      makeClient([
        {
          rows: [
            makeEvidence({
              id: 2,
              matchId: 200,
              competitionId: 2,
              won: false,
            }),
          ],
        },
      ]);

    const singles =
      await getCurrentPlacementLevel(
        singlesClient,
        10,
        1,
      );

    const doubles =
      await getCurrentPlacementLevel(
        doublesClient,
        10,
        2,
      );

    assert.equal(
      singles.wins,
      1,
    );

    assert.equal(
      singles.losses,
      0,
    );

    assert.equal(
      doubles.wins,
      0,
    );

    assert.equal(
      doubles.losses,
      1,
    );
  },
);