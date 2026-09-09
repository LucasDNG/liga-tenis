export class MatchResultSideFlowError
  extends Error {
  constructor(
    message,
    reason =
      "match_result_side_flow_error",
    statusCode =
      409,
    details =
      null,
  ) {
    super(message);

    this.name =
      "MatchResultSideFlowError";

    this.reason =
      reason;

    this.statusCode =
      statusCode;

    this.details =
      details;
  }
}


const positiveInteger = (
  value,
  field,
) => {
  const number =
    Number(value);

  if (
    !Number.isInteger(
      number,
    ) ||
    number <= 0
  ) {
    throw new MatchResultSideFlowError(
      `${field} inválido.`,
      "invalid_identifier",
      400,
      {
        field,
        value,
      },
    );
  }

  return number;
};


const validSide = (
  value,
  field =
    "side",
) => {
  const side =
    Number(value);

  if (
    side !== 1 &&
    side !== 2
  ) {
    throw new MatchResultSideFlowError(
      `${field} inválido.`,
      "invalid_match_side",
      409,
      {
        field,
        value,
      },
    );
  }

  return side;
};


const normalizeParticipants = (
  participants,
) => {
  if (
    !Array.isArray(
      participants,
    )
  ) {
    throw new MatchResultSideFlowError(
      "participants debe ser un array.",
      "invalid_participants",
      409,
    );
  }

  return participants.map(
    (
      participant,
    ) => ({
      ...participant,

      user_id:
        positiveInteger(
          participant
            ?.user_id ??
          participant
            ?.id,
          "participant.user_id",
        ),

      side:
        validSide(
          participant
            ?.side,
          "participant.side",
        ),

      position:
        positiveInteger(
          participant
            ?.position ??
          1,
          "participant.position",
        ),
    }),
  );
};


const getParticipant = (
  participants,
  userId,
) => {
  const normalizedUserId =
    positiveInteger(
      userId,
      "userId",
    );

  const normalizedParticipants =
    normalizeParticipants(
      participants,
    );

  const participant =
    normalizedParticipants.find(
      (
        item,
      ) =>
        item.user_id ===
        normalizedUserId,
    );

  if (
    !participant
  ) {
    throw new MatchResultSideFlowError(
      "El usuario no pertenece al partido.",
      "user_not_in_match",
      403,
      {
        user_id:
          normalizedUserId,
      },
    );
  }

  return participant;
};


export const getUserMatchSide = (
  participants,
  userId,
) =>
  getParticipant(
    participants,
    userId,
  ).side;


export const getOpponentSide = (
  side,
) => {
  const normalizedSide =
    validSide(
      side,
    );

  return normalizedSide ===
    1
      ? 2
      : 1;
};


export const getSideParticipants = (
  participants,
  side,
) => {
  const normalizedSide =
    validSide(
      side,
    );

  return normalizeParticipants(
    participants,
  )
    .filter(
      (
        participant,
      ) =>
        participant.side ===
        normalizedSide,
    )
    .sort(
      (
        a,
        b,
      ) =>
        a.position -
        b.position,
    );
};


export const getSideUserIds = (
  participants,
  side,
) =>
  getSideParticipants(
    participants,
    side,
  ).map(
    (
      participant,
    ) =>
      participant.user_id,
  );


export const getSubmittingSide = (
  participants,
  resultSubmittedBy,
) => {
  const submitterId =
    positiveInteger(
      resultSubmittedBy,
      "resultSubmittedBy",
    );

  return getUserMatchSide(
    participants,
    submitterId,
  );
};


export const getResultViewerState = ({
  participants,
  viewerUserId,
  resultSubmittedBy = null,
  status,
}) => {
  const viewerSide =
    getUserMatchSide(
      participants,
      viewerUserId,
    );

  const awaitingConfirmation =
    status ===
    "awaiting_confirmation";

  if (
    !awaitingConfirmation ||
    !resultSubmittedBy
  ) {
    return {
      viewer_side:
        viewerSide,

      submitting_side:
        null,

      confirmation_side:
        null,

      submitted_by_same_side:
        false,

      can_confirm:
        false,

      can_reject:
        false,

      sees_proposed_result:
        false,
    };
  }

  const submittingSide =
    getSubmittingSide(
      participants,
      resultSubmittedBy,
    );

  const confirmationSide =
    getOpponentSide(
      submittingSide,
    );

  const sameSide =
    viewerSide ===
    submittingSide;

  return {
    viewer_side:
      viewerSide,

    submitting_side:
      submittingSide,

    confirmation_side:
      confirmationSide,

    submitted_by_same_side:
      sameSide,

    can_confirm:
      !sameSide,

    can_reject:
      !sameSide,

    sees_proposed_result:
      true,
  };
};


export const assertCanSubmitResult = ({
  participants,
  userId,
  status,
}) => {
  const userSide =
    getUserMatchSide(
      participants,
      userId,
    );

  if (
    status !==
    "pending"
  ) {
    throw new MatchResultSideFlowError(
      "El partido no está disponible para cargar un resultado.",
      "match_not_pending",
      409,
      {
        status,
      },
    );
  }

  return {
    user_id:
      Number(
        userId,
      ),

    side:
      userSide,

    can_submit:
      true,
  };
};


export const assertCanRespondToResult = ({
  participants,
  userId,
  resultSubmittedBy,
  status,
}) => {
  if (
    status !==
    "awaiting_confirmation"
  ) {
    throw new MatchResultSideFlowError(
      "El partido no tiene un resultado pendiente de confirmación.",
      "result_not_awaiting_confirmation",
      409,
      {
        status,
      },
    );
  }

  const responderSide =
    getUserMatchSide(
      participants,
      userId,
    );

  const submittingSide =
    getSubmittingSide(
      participants,
      resultSubmittedBy,
    );

  if (
    responderSide ===
    submittingSide
  ) {
    throw new MatchResultSideFlowError(
      "El resultado debe ser confirmado o rechazado por la pareja rival.",
      "same_side_cannot_confirm",
      403,
      {
        responder_side:
          responderSide,

        submitting_side:
          submittingSide,

        submitted_by:
          Number(
            resultSubmittedBy,
          ),
      },
    );
  }

  return {
    user_id:
      Number(
        userId,
      ),

    responder_side:
      responderSide,

    submitting_side:
      submittingSide,

    confirmation_side:
      getOpponentSide(
        submittingSide,
      ),

    can_confirm:
      true,

    can_reject:
      true,
  };
};


export const assertWinnerSideExists = (
  participants,
  winnerSide,
) => {
  const normalizedSide =
    validSide(
      winnerSide,
      "winnerSide",
    );

  const sideParticipants =
    getSideParticipants(
      participants,
      normalizedSide,
    );

  if (
    sideParticipants.length ===
    0
  ) {
    throw new MatchResultSideFlowError(
      "El lado ganador no contiene participantes.",
      "winner_side_empty",
      409,
      {
        winner_side:
          normalizedSide,
      },
    );
  }

  return {
    winner_side:
      normalizedSide,

    winner_user_ids:
      sideParticipants.map(
        (
          participant,
        ) =>
          participant.user_id,
      ),
  };
};


export const buildResultSideFlow = ({
  participants,
  resultSubmittedBy,
  winnerSide,
}) => {
  const submittingSide =
    getSubmittingSide(
      participants,
      resultSubmittedBy,
    );

  const winner =
    assertWinnerSideExists(
      participants,
      winnerSide,
    );

  return {
    submitting_side:
      submittingSide,

    confirmation_side:
      getOpponentSide(
        submittingSide,
      ),

    winner_side:
      winner
        .winner_side,

    winner_user_ids:
      winner
        .winner_user_ids,

    side1_user_ids:
      getSideUserIds(
        participants,
        1,
      ),

    side2_user_ids:
      getSideUserIds(
        participants,
        2,
      ),
  };
};


export const sendMatchResultSideFlowError = (
  error,
  res,
  next,
) => {
  if (
    error instanceof
      MatchResultSideFlowError
  ) {
    return res
      .status(
        error.statusCode,
      )
      .json({
        message:
          error.message,

        reason:
          error.reason,

        details:
          error.details,
      });
  }

  return next(
    error,
  );
};


export default {
  getUserMatchSide,
  getOpponentSide,
  getSideParticipants,
  getSideUserIds,
  getSubmittingSide,
  getResultViewerState,
  assertCanSubmitResult,
  assertCanRespondToResult,
  assertWinnerSideExists,
  buildResultSideFlow,
  sendMatchResultSideFlowError,
};