import test from "node:test";
import assert from "node:assert/strict";

import {
  MatchResultSideFlowError,
  getUserMatchSide,
  getOpponentSide,
  getSideUserIds,
  getSubmittingSide,
  getResultViewerState,
  assertCanSubmitResult,
  assertCanRespondToResult,
  assertWinnerSideExists,
  buildResultSideFlow,
} from "../src/services/matchResultSideFlow.service.js";


const singlesParticipants = [
  {
    user_id:
      10,

    side:
      1,

    position:
      1,
  },
  {
    user_id:
      20,

    side:
      2,

    position:
      1,
  },
];


const doublesParticipants = [
  {
    user_id:
      10,

    side:
      1,

    position:
      1,
  },
  {
    user_id:
      11,

    side:
      1,

    position:
      2,
  },
  {
    user_id:
      20,

    side:
      2,

    position:
      1,
  },
  {
    user_id:
      21,

    side:
      2,

    position:
      2,
  },
];


test(
  "resuelve lado de jugador singles",
  () => {
    assert.equal(
      getUserMatchSide(
        singlesParticipants,
        10,
      ),
      1,
    );

    assert.equal(
      getUserMatchSide(
        singlesParticipants,
        20,
      ),
      2,
    );
  },
);


test(
  "resuelve lado de cualquiera de los cuatro jugadores dobles",
  () => {
    assert.equal(
      getUserMatchSide(
        doublesParticipants,
        10,
      ),
      1,
    );

    assert.equal(
      getUserMatchSide(
        doublesParticipants,
        11,
      ),
      1,
    );

    assert.equal(
      getUserMatchSide(
        doublesParticipants,
        20,
      ),
      2,
    );

    assert.equal(
      getUserMatchSide(
        doublesParticipants,
        21,
      ),
      2,
    );
  },
);


test(
  "lado rival de 1 es 2 y viceversa",
  () => {
    assert.equal(
      getOpponentSide(
        1,
      ),
      2,
    );

    assert.equal(
      getOpponentSide(
        2,
      ),
      1,
    );
  },
);


test(
  "obtiene los dos IDs de una pareja dobles",
  () => {
    assert.deepEqual(
      getSideUserIds(
        doublesParticipants,
        1,
      ),
      [
        10,
        11,
      ],
    );

    assert.deepEqual(
      getSideUserIds(
        doublesParticipants,
        2,
      ),
      [
        20,
        21,
      ],
    );
  },
);


test(
  "si compañero 11 carga resultado, submitting side es lado 1",
  () => {
    assert.equal(
      getSubmittingSide(
        doublesParticipants,
        11,
      ),
      1,
    );
  },
);


test(
  "cualquiera de una pareja puede cargar resultado",
  () => {
    const player10 =
      assertCanSubmitResult({
        participants:
          doublesParticipants,

        userId:
          10,

        status:
          "pending",
      });

    const player11 =
      assertCanSubmitResult({
        participants:
          doublesParticipants,

        userId:
          11,

        status:
          "pending",
      });

    assert.equal(
      player10.side,
      1,
    );

    assert.equal(
      player11.side,
      1,
    );

    assert.equal(
      player10.can_submit,
      true,
    );

    assert.equal(
      player11.can_submit,
      true,
    );
  },
);


test(
  "compañero del que cargó ve el resultado pero no puede confirmarlo",
  () => {
    const state =
      getResultViewerState({
        participants:
          doublesParticipants,

        viewerUserId:
          11,

        resultSubmittedBy:
          10,

        status:
          "awaiting_confirmation",
      });

    assert.equal(
      state.viewer_side,
      1,
    );

    assert.equal(
      state.submitting_side,
      1,
    );

    assert.equal(
      state.confirmation_side,
      2,
    );

    assert.equal(
      state.sees_proposed_result,
      true,
    );

    assert.equal(
      state.submitted_by_same_side,
      true,
    );

    assert.equal(
      state.can_confirm,
      false,
    );

    assert.equal(
      state.can_reject,
      false,
    );
  },
);


test(
  "jugador rival ve resultado y puede confirmarlo",
  () => {
    const state =
      getResultViewerState({
        participants:
          doublesParticipants,

        viewerUserId:
          20,

        resultSubmittedBy:
          10,

        status:
          "awaiting_confirmation",
      });

    assert.equal(
      state.viewer_side,
      2,
    );

    assert.equal(
      state.submitting_side,
      1,
    );

    assert.equal(
      state.confirmation_side,
      2,
    );

    assert.equal(
      state.can_confirm,
      true,
    );

    assert.equal(
      state.can_reject,
      true,
    );
  },
);


test(
  "el segundo integrante rival también puede confirmar",
  () => {
    const result =
      assertCanRespondToResult({
        participants:
          doublesParticipants,

        userId:
          21,

        resultSubmittedBy:
          10,

        status:
          "awaiting_confirmation",
      });

    assert.equal(
      result.responder_side,
      2,
    );

    assert.equal(
      result.submitting_side,
      1,
    );

    assert.equal(
      result.can_confirm,
      true,
    );
  },
);


test(
  "compañero del cargador no puede confirmar",
  () => {
    assert.throws(
      () =>
        assertCanRespondToResult({
          participants:
            doublesParticipants,

          userId:
            11,

          resultSubmittedBy:
            10,

          status:
            "awaiting_confirmation",
        }),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            MatchResultSideFlowError,
        );

        assert.equal(
          error.reason,
          "same_side_cannot_confirm",
        );

        return true;
      },
    );
  },
);


test(
  "compañero del cargador tampoco puede rechazar porque la autorización es por lado",
  () => {
    assert.throws(
      () =>
        assertCanRespondToResult({
          participants:
            doublesParticipants,

          userId:
            10,

          resultSubmittedBy:
            11,

          status:
            "awaiting_confirmation",
        }),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "same_side_cannot_confirm",
        );

        return true;
      },
    );
  },
);


test(
  "singles conserva exactamente el mismo modelo de dos lados",
  () => {
    const responder =
      assertCanRespondToResult({
        participants:
          singlesParticipants,

        userId:
          20,

        resultSubmittedBy:
          10,

        status:
          "awaiting_confirmation",
      });

    assert.equal(
      responder.submitting_side,
      1,
    );

    assert.equal(
      responder.confirmation_side,
      2,
    );

    assert.equal(
      responder.can_confirm,
      true,
    );
  },
);


test(
  "winner side dobles representa a los dos jugadores ganadores",
  () => {
    const winner =
      assertWinnerSideExists(
        doublesParticipants,
        2,
      );

    assert.equal(
      winner.winner_side,
      2,
    );

    assert.deepEqual(
      winner.winner_user_ids,
      [
        20,
        21,
      ],
    );
  },
);


test(
  "construye flujo completo dobles",
  () => {
    const result =
      buildResultSideFlow({
        participants:
          doublesParticipants,

        resultSubmittedBy:
          11,

        winnerSide:
          2,
      });

    assert.deepEqual(
      result,
      {
        submitting_side:
          1,

        confirmation_side:
          2,

        winner_side:
          2,

        winner_user_ids: [
          20,
          21,
        ],

        side1_user_ids: [
          10,
          11,
        ],

        side2_user_ids: [
          20,
          21,
        ],
      },
    );
  },
);


test(
  "rechaza usuario ajeno al partido",
  () => {
    assert.throws(
      () =>
        getUserMatchSide(
          doublesParticipants,
          99,
        ),
      (
        error,
      ) => {
        assert.ok(
          error instanceof
            MatchResultSideFlowError,
        );

        assert.equal(
          error.reason,
          "user_not_in_match",
        );

        return true;
      },
    );
  },
);


test(
  "rechaza respuesta si el partido no espera confirmación",
  () => {
    assert.throws(
      () =>
        assertCanRespondToResult({
          participants:
            doublesParticipants,

          userId:
            20,

          resultSubmittedBy:
            10,

          status:
            "pending",
        }),
      (
        error,
      ) => {
        assert.equal(
          error.reason,
          "result_not_awaiting_confirmation",
        );

        return true;
      },
    );
  },
);