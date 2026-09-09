import test from "node:test";
import assert from "node:assert/strict";

import {
  MatchControllerCompetitionError,
  sendMatchControllerCompetitionError,
} from "../src/services/matchControllerCompetition.service.js";


test(
  "MatchControllerCompetitionError conserva metadata HTTP",
  () => {
    const error =
      new MatchControllerCompetitionError(
        "No pertenecés",
        "user_not_in_match",
        403,
        {
          match_id:
            50,
        },
      );

    assert.equal(
      error.name,
      "MatchControllerCompetitionError",
    );

    assert.equal(
      error.reason,
      "user_not_in_match",
    );

    assert.equal(
      error.statusCode,
      403,
    );

    assert.deepEqual(
      error.details,
      {
        match_id:
          50,
      },
    );
  },
);


test(
  "sendMatchControllerCompetitionError responde errores propios",
  () => {
    const payload =
      {};

    const res = {
      statusCode:
        null,

      status(
        code,
      ) {
        this.statusCode =
          code;

        return this;
      },

      json(
        body,
      ) {
        payload.body =
          body;

        return body;
      },
    };

    let nextCalled =
      false;

    const error =
      new MatchControllerCompetitionError(
        "Dobles pendiente",
        "doubles_elo_not_implemented",
        409,
      );

    sendMatchControllerCompetitionError(
      error,
      res,
      () => {
        nextCalled =
          true;
      },
    );

    assert.equal(
      res.statusCode,
      409,
    );

    assert.equal(
      payload
        .body
        .reason,
      "doubles_elo_not_implemented",
    );

    assert.equal(
      nextCalled,
      false,
    );
  },
);


test(
  "sendMatchControllerCompetitionError deriva errores desconocidos",
  () => {
    const res = {
      status() {
        throw new Error(
          "no debería responder",
        );
      },
    };

    const original =
      new Error(
        "boom",
      );

    let received =
      null;

    sendMatchControllerCompetitionError(
      original,
      res,
      (
        error,
      ) => {
        received =
          error;
      },
    );

    assert.equal(
      received,
      original,
    );
  },
);