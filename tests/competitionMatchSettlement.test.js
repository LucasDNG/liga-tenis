import test from "node:test";
import assert from "node:assert/strict";

import {
  CompetitionMatchSettlementError,
  getCompetitionMatchSettlement,
  assertMatchNotSettled,
} from "../src/services/competitionMatchSettlement.service.js";


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

      const response =
        responses[
          index
        ];

      index += 1;

      if (
        response instanceof
        Error
      ) {
        throw response;
      }

      return {
        rows:
          response?.rows ??
          [],

        rowCount:
          response
            ?.rowCount ??
          response
            ?.rows
            ?.length ??
          0,
      };
    },
  };
};


test(
  "getCompetitionMatchSettlement busca por match_id",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              id: 1,
              match_id: 50,
              competition_id: 3,
              settled_at:
                new Date(),
            },
          ],
        },
      ]);

    const result =
      await getCompetitionMatchSettlement(
        client,
        50,
      );

    assert.equal(
      Number(
        result.match_id,
      ),
      50,
    );

    assert.equal(
      Number(
        result.competition_id,
      ),
      3,
    );

    assert.deepEqual(
      client.calls[0].params,
      [50],
    );
  },
);


test(
  "getCompetitionMatchSettlement devuelve null si todavía no fue aplicado",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
        },
      ]);

    assert.equal(
      await getCompetitionMatchSettlement(
        client,
        50,
      ),
      null,
    );
  },
);


test(
  "assertMatchNotSettled permite partido nuevo",
  async () => {
    const client =
      makeClient([
        {
          rows: [],
        },
      ]);

    assert.equal(
      await assertMatchNotSettled(
        client,
        50,
      ),
      true,
    );
  },
);


test(
  "assertMatchNotSettled bloquea doble settlement",
  async () => {
    const client =
      makeClient([
        {
          rows: [
            {
              id: 1,
              match_id: 50,
              competition_id: 3,
            },
          ],
        },
      ]);

    await assert.rejects(
      () =>
        assertMatchNotSettled(
          client,
          50,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionMatchSettlementError,
        );

        assert.equal(
          error.reason,
          "match_already_settled",
        );

        assert.equal(
          error.details
            .competition_id,
          3,
        );

        return true;
      },
    );
  },
);


test(
  "settlement exige matchId positivo",
  async () => {
    const client =
      makeClient([]);

    await assert.rejects(
      () =>
        getCompetitionMatchSettlement(
          client,
          0,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            CompetitionMatchSettlementError,
        );

        assert.equal(
          error.reason,
          "invalid_identifier",
        );

        return true;
      },
    );
  },
);