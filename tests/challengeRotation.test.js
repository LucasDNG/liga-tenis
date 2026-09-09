import test from "node:test";
import assert from "node:assert/strict";

import {
  getCompetitionRotationState,
  hasOlderPendingCompetitionRivals,
} from "../src/services/challengeRotation.service.js";


const createClient = (
  responses,
) => {
  const queue = [
    ...responses,
  ];

  return {
    calls: [],

    async query(
      text,
      params = [],
    ) {
      this.calls.push({
        text,
        params,
      });

      if (
        queue.length === 0
      ) {
        throw new Error(
          "Falta respuesta mock.",
        );
      }

      return queue.shift();
    },
  };
};


test(
  "partido aceptado bloquea solamente dentro de la competición",
  async () => {
    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              challenge_id: 77,
              competition_id: 10,
              challenger_id: 1,
              challenger_name:
                "Jugador Uno",
            },
          ],
        },
      ]);

    const state =
      await getCompetitionRotationState(
        client,
        {
          userId: 2,
          competitionId: 10,
        },
      );

    assert.equal(
      state.blockedByActiveMatch,
      true,
    );

    assert.equal(
      state.competition_id,
      10,
    );

    assert.equal(
      state.activeChallenge
        .challenge_id,
      77,
    );

    assert.deepEqual(
      client.calls[0].params,
      [10, 2],
    );
  },
);


test(
  "sin aceptado devuelve primer pendiente de esa competición",
  async () => {
    const client =
      createClient([
        {
          rowCount: 0,
          rows: [],
        },
        {
          rowCount: 2,
          rows: [
            {
              id: 4,
              competition_id: 20,
              challenger_name:
                "Primero",
            },
            {
              id: 5,
              competition_id: 20,
              challenger_name:
                "Segundo",
            },
          ],
        },
      ]);

    const state =
      await getCompetitionRotationState(
        client,
        {
          userId: 9,
          competitionId: 20,
        },
      );

    assert.equal(
      state.blockedByActiveMatch,
      false,
    );

    assert.equal(
      state.currentChallenge.id,
      4,
    );

    assert.equal(
      state.pendingChallenges.length,
      2,
    );

    assert.deepEqual(
      client.calls[1].params,
      [20, 9],
    );
  },
);


test(
  "sin resolución previa no hay rival anterior bloqueando",
  async () => {
    const client =
      createClient([
        {
          rowCount: 0,
          rows: [],
        },
      ]);

    const blocked =
      await hasOlderPendingCompetitionRivals(
        client,
        {
          competitionId: 10,
          challengerId: 1,
          challengedId: 2,
        },
      );

    assert.equal(
      blocked,
      false,
    );

    assert.equal(
      client.calls.length,
      1,
    );
  },
);


test(
  "rival anterior pendiente se busca dentro de competition_id",
  async () => {
    const resolvedAt =
      new Date();

    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              resolved_at:
                resolvedAt,
            },
          ],
        },
        {
          rowCount: 1,
          rows: [
            {
              id: 88,
            },
          ],
        },
      ]);

    const blocked =
      await hasOlderPendingCompetitionRivals(
        client,
        {
          competitionId: 10,
          challengerId: 1,
          challengedId: 2,
        },
      );

    assert.equal(
      blocked,
      true,
    );

    assert.deepEqual(
      client.calls[0].params,
      [10, 1, 2],
    );

    assert.deepEqual(
      client.calls[1].params,
      [
        10,
        2,
        1,
        resolvedAt,
      ],
    );
  },
);