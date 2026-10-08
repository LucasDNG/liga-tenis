export const isDoublesMatch = (
  match,
) =>
  match?.competition_format ===
  "doubles";


export const getSubmittedSide = (
  match,
) => {
  const submittedBy =
    Number(
      match?.result_submitted_by,
    );

  if (
    !Number.isInteger(
      submittedBy,
    )
  ) {
    return null;
  }

  const participants =
    Array.isArray(
      match?.participants,
    )
      ? match.participants
      : [];

  const participant =
    participants.find(
      (
        item,
      ) =>
        Number(
          item?.user_id,
        ) ===
        submittedBy,
    );

  const side =
    Number(
      participant?.side,
    );

  return side === 1 ||
    side === 2
    ? side
    : null;
};


export const submittedByMySide = ({
  mySide,
  submittedSide,
  submittedByMe = false,
}) => {
  if (
    mySide !== null &&
    mySide !== undefined &&
    submittedSide !== null &&
    submittedSide !== undefined &&
    Number(mySide) ===
      Number(submittedSide)
  ) {
    return true;
  }

  return Boolean(
    submittedByMe,
  );
};


export const canEditMatchScore = ({
  status,
  hasCancellationRequest,
}) =>
  status === "pending" &&
  !hasCancellationRequest;


export const isMatchResultBlocked = ({
  status,
  matchStarted,
}) =>
  status === "pending" &&
  !matchStarted;


export const canConfirmOrRejectMatchResult = ({
  status,
  mySide,
  submittedSide,
  submittedByMe = false,
}) =>
  status ===
    "awaiting_confirmation" &&
  !submittedByMySide({
    mySide,
    submittedSide,
    submittedByMe,
  });


export const canRequestMatchCancellation = ({
  status,
  format,
  hasCancellationRequest,
}) =>
  status === "pending" &&
  !hasCancellationRequest &&
  format !== "doubles";


export const getWinnerLabel = ({
  format,
  winnerId,
  winnerName,
  side1 = [],
  side2 = [],
  side1Name,
  side2Name,
}) => {
  if (
    format !== "doubles"
  ) {
    return winnerName;
  }

  const normalizedWinnerId =
    Number(winnerId);

  const onSide = (
    participants,
    name,
  ) =>
    participants.some(
      (
        participant,
      ) =>
        Number(
          participant?.user_id,
        ) ===
        normalizedWinnerId,
    )
      ? name
      : null;

  return (
    onSide(
      side1,
      side1Name,
    ) ||
    onSide(
      side2,
      side2Name,
    ) ||
    winnerName
  );
};
