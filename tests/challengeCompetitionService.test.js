import test from "node:test";
import assert from "node:assert/strict";

import {
  ChallengeCompetitionError,
  getHistoricalCompetitionMeetings,
  getCompetitionRejectionCooldown,
  getActiveCompetitionChallengeBetween,
} from "../src/services/challengeCompetition.service.js";


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
          "No hay respuesta mock configurada.",
        );
      }

      return queue.shift();
    },
  };
};


test(
  "historial queda limitado por competition_id",
  async () => {
    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              total: 3,
            },
          ],
        },
      ]);

    const total =
      await getHistoricalCompetitionMeetings(
        client,
        {
          competitionId: 10,
          player1Id: 1,
          player2Id: 2,
        },
      );

    assert.equal(
      total,
      3,
    );

    assert.match(
      client.calls[0].text,
      /m\.competition_id\s*=\s*\$1/,
    );

    assert.deepEqual(
      client.calls[0].params,
      [10, 1, 2],
    );
  },
);


test(
  "historial usa match_participants y no player1/player2",
  async () => {
    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              total: 1,
            },
          ],
        },
      ]);

    await getHistoricalCompetitionMeetings(
      client,
      {
        competitionId: 20,
        player1Id: 10,
        player2Id: 11,
      },
    );

    assert.match(
      client.calls[0].text,
      /match_participants/,
    );

    assert.doesNotMatch(
      client.calls[0].text,
      /player1_id\s*=/,
    );
  },
);


test(
  "cooldown se consulta dentro de la competición",
  async () => {
    const future =
      new Date(
        Date.now() +
        86_400_000,
      );

    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              rejected_at:
                new Date(),

              available_at:
                future,
            },
          ],
        },
      ]);

    const cooldown =
      await getCompetitionRejectionCooldown(
        client,
        {
          competitionId: 30,
          challengerId: 1,
          challengedId: 2,
        },
      );

    assert.ok(
      cooldown,
    );

    assert.deepEqual(
      client.calls[0].params,
      [30, 1, 2],
    );

    assert.match(
      client.calls[0].text,
      /competition_id\s*=\s*\$1/,
    );
  },
);


test(
  "cooldown vencido devuelve null",
  async () => {
    const client =
      createClient([
        {
          rowCount: 1,
          rows: [
            {
              rejected_at:
                new Date(
                  Date.now() -
                  10_000,
                ),

              available_at:
                new Date(
                  Date.now() -
                  1_000,
                ),
            },
          ],
        },
      ]);

    const cooldown =
      await getCompetitionRejectionCooldown(
        client,
        {
          competitionId: 30,
          challengerId: 1,
          challengedId: 2,
        },
      );

    assert.equal(
      cooldown,
      null,
    );
  },
);


test(
  "desafío activo de singles no bloquea otra competición",
  async () => {
    const client =
      createClient([
        {
          rowCount: 0,
          rows: [],
        },
      ]);

    const result =
      await getActiveCompetitionChallengeBetween(
        client,
        {
          competitionId: 99,
          player1Id: 1,
          player2Id: 2,
        },
      );

    assert.equal(
      result,
      null,
    );

    assert.deepEqual(
      client.calls[0].params,
      [99, 1, 2],
    );
  },
);


test(
  "identificadores inválidos se rechazan antes de consultar DB",
  async () => {
    const client =
      createClient([]);

    await assert.rejects(
      () =>
        getHistoricalCompetitionMeetings(
          client,
          {
            competitionId: 0,
            player1Id: 1,
            player2Id: 2,
          },
        ),
      (error) => {
        assert.ok(
          error instanceof
            ChallengeCompetitionError,
        );

        assert.equal(
          error.reason,
          "invalid_identifier",
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