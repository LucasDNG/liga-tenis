import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import {
  api,
} from "../api";

import {
  useAuth,
} from "../context/AuthContext";

import "./RankingPage.css";
import "./DoublesRanking.css";


const DEFAULT_FORMAT =
  "singles";

const DEFAULT_GENDER =
  "male";

const DEFAULT_PLACEMENT_MATCHES =
  5;


const VALID_FORMATS =
  new Set([
    "singles",
    "doubles",
  ]);

const VALID_GENDERS =
  new Set([
    "male",
    "female",
  ]);


const normalizeFormat = (
  value,
) =>
  VALID_FORMATS.has(
    value,
  )
    ? value
    : DEFAULT_FORMAT;


const normalizeGender = (
  value,
) =>
  VALID_GENDERS.has(
    value,
  )
    ? value
    : DEFAULT_GENDER;


const formatRecordDate = (
  value,
) => {
  if (!value) {
    return "Récord previo";
  }

  const date =
    new Date(
      value,
    );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return "Récord histórico";
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day:
        "2-digit",

      month:
        "2-digit",

      year:
        "numeric",

      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(
    date,
  );
};


const getPlayerName = (
  player,
) =>
  player?.display_name ||
  player?.name ||
  [
    player?.last_name,
    player?.first_name,
  ]
    .filter(Boolean)
    .join(" ") ||
  `Jugador #${player?.id ?? ""}`;


const getPairName = (
  pair,
) => {
  if (
    pair?.display_name
  ) {
    return pair.display_name;
  }

  if (
    pair?.name
  ) {
    return pair.name;
  }

  const player1 =
    getPlayerName(
      pair?.player1,
    );

  const player2 =
    getPlayerName(
      pair?.player2,
    );

  return `${player1} / ${player2}`;
};


const getPairMembers = (
  pair,
) => {
  if (
    Array.isArray(
      pair?.members,
    ) &&
    pair.members.length > 0
  ) {
    return pair.members;
  }

  return [
    pair?.player1,
    pair?.player2,
  ].filter(Boolean);
};


const pairContainsUser = (
  pair,
  userId,
) => {
  const normalizedUserId =
    Number(userId);

  return (
    Number(
      pair?.player1_id,
    ) ===
      normalizedUserId ||
    Number(
      pair?.player2_id,
    ) ===
      normalizedUserId
  );
};


const pairsSharePlayer = (
  pairA,
  pairB,
) => {
  const a =
    new Set([
      Number(
        pairA?.player1_id,
      ),
      Number(
        pairA?.player2_id,
      ),
    ]);

  return (
    a.has(
      Number(
        pairB?.player1_id,
      ),
    ) ||
    a.has(
      Number(
        pairB?.player2_id,
      ),
    )
  );
};


function RankingSelector({
  format,
  gender,
  onFormatChange,
  onGenderChange,
}) {
  return (
    <div className="ranking-selector">
      <div className="ranking-selector-group">
        <span className="ranking-selector-label">
          MODALIDAD
        </span>

        <div className="ranking-switch">
          <button
            type="button"
            className={
              format ===
              "singles"
                ? "active"
                : ""
            }
            onClick={() =>
              onFormatChange(
                "singles",
              )
            }
          >
            Singles
          </button>

          <button
            type="button"
            className={
              format ===
              "doubles"
                ? "active"
                : ""
            }
            onClick={() =>
              onFormatChange(
                "doubles",
              )
            }
          >
            Dobles
          </button>
        </div>
      </div>

      <div className="ranking-selector-group">
        <span className="ranking-selector-label">
          CATEGORÍA
        </span>

        <div className="ranking-switch">
          <button
            type="button"
            className={
              gender ===
              "male"
                ? "active"
                : ""
            }
            onClick={() =>
              onGenderChange(
                "male",
              )
            }
          >
            Masculino
          </button>

          <button
            type="button"
            className={
              gender ===
              "female"
                ? "active"
                : ""
            }
            onClick={() =>
              onGenderChange(
                "female",
              )
            }
          >
            Femenino
          </button>
        </div>
      </div>
    </div>
  );
}


function PlayerFlags({
  isYou,
  provisional,
  inactive,
}) {
  if (
    !isYou &&
    !provisional &&
    !inactive
  ) {
    return null;
  }

  return (
    <span className="ranking-player-flags">
      {isYou && (
        <em className="ranking-you">
          VOS
        </em>
      )}

      {provisional && (
        <small className="ranking-provisional">
          NIVELATORIO
        </small>
      )}

      {inactive && (
        <small className="ranking-inactive">
          INACTIVO
        </small>
      )}
    </span>
  );
}


function PairMembers({
  pair,
  currentUserId,
}) {
  const members =
    getPairMembers(
      pair,
    );

  return (
    <div className="doubles-pair-members">
      {members.map(
        (
          member,
          index,
        ) => (
          <div
            className="doubles-pair-member"
            key={
              member?.id ??
              index
            }
          >
            {member?.id ? (
              <Link
                to={`/jugadores/${member.id}`}
                className="doubles-pair-member-link"
              >
                {
                  getPlayerName(
                    member,
                  )
                }
              </Link>
            ) : (
              <span>
                {
                  getPlayerName(
                    member,
                  )
                }
              </span>
            )}

            {Number(
              member?.id,
            ) ===
              Number(
                currentUserId,
              ) && (
              <em>
                VOS
              </em>
            )}
          </div>
        ),
      )}
    </div>
  );
}


function PairPlacement({
  pair,
  placementMatches,
}) {
  const played =
    Number(
      pair?.matches_played ??
      pair?.placement_matches_played ??
      0,
    );

  const total =
    Number(
      pair?.placement_matches ??
      placementMatches,
    );

  if (
    !pair?.provisional
  ) {
    return (
      <span className="doubles-official-badge">
        OFICIAL
      </span>
    );
  }

  return (
    <span className="doubles-placement-badge">
      NIVELATORIO {played}/{total}
    </span>
  );
}


function DoublesPairCard({
  pair,
  currentUserId,
  placementMatches,
  compact =
    false,
}) {
  return (
    <article
      className={
        compact
          ? "doubles-my-pair-card compact"
          : "doubles-my-pair-card"
      }
    >
      <div className="doubles-my-pair-top">
        <span>
          PAREJA #{pair.id}
        </span>

        <PairPlacement
          pair={pair}
          placementMatches={
            placementMatches
          }
        />
      </div>

      <PairMembers
        pair={pair}
        currentUserId={
          currentUserId
        }
      />

      <div className="doubles-my-pair-stats">
        <div>
          <strong>
            {pair.rating}
          </strong>

          <span>
            ELO
          </span>
        </div>

        <div>
          <strong>
            {
              pair
                .matches_played
            }
          </strong>

          <span>
            PARTIDOS
          </span>
        </div>

        <div>
          <strong>
            {
              pair.wins
            }-
            {
              pair.losses
            }
          </strong>

          <span>
            V-D
          </span>
        </div>
      </div>
    </article>
  );
}


function FormPairPanel({
  open,
  partners,
  selectedPartnerId,
  onSelectedPartnerId,
  onSubmit,
  creating,
  onClose,
}) {
  if (!open) {
    return null;
  }

  return (
    <section className="doubles-form-panel">
      <div className="doubles-form-heading">
        <div>
          <span>
            DOBLES · LA RED
          </span>

          <h2>
            Formar pareja
          </h2>

          <p>
            Elegí un jugador de tu
            categoría. Si esa combinación
            ya existió, recupera el mismo
            Elo y todo su historial.
          </p>
        </div>

        <button
          type="button"
          className="doubles-form-close"
          onClick={
            onClose
          }
        >
          ×
        </button>
      </div>

      <form
        className="doubles-form"
        onSubmit={
          onSubmit
        }
      >
        <label>
          <span>
            COMPAÑERO
          </span>

          <select
            value={
              selectedPartnerId
            }
            onChange={
              (
                event,
              ) =>
                onSelectedPartnerId(
                  event.target
                    .value,
                )
            }
            disabled={
              creating
            }
          >
            <option value="">
              Seleccionar jugador
            </option>

            {partners.map(
              (
                partner,
              ) => (
                <option
                  key={
                    partner.id
                  }
                  value={
                    partner.id
                  }
                >
                  {
                    getPlayerName(
                      partner,
                    )
                  }
                  {
                    partner.pair_exists
                      ? ` · pareja existente · Elo ${partner.pair_rating}`
                      : ""
                  }
                </option>
              ),
            )}
          </select>
        </label>

        <div className="doubles-form-actions">
          <button
            type="submit"
            className="doubles-primary-button"
            disabled={
              creating ||
              !selectedPartnerId
            }
          >
            {creating
              ? "CREANDO..."
              : "FORMAR PAREJA"}
          </button>

          <button
            type="button"
            className="doubles-secondary-button"
            onClick={
              onClose
            }
            disabled={
              creating
            }
          >
            CANCELAR
          </button>
        </div>
      </form>

      {partners.length ===
        0 && (
        <div className="doubles-empty-inline">
          No hay compañeros elegibles
          disponibles en esta categoría.
        </div>
      )}
    </section>
  );
}


function ChallengePairDialog({
  targetPair,
  ownPairs,
  selectedPairId,
  onSelectedPairId,
  onConfirm,
  onClose,
  sending,
}) {
  if (
    !targetPair
  ) {
    return null;
  }

  return (
    <div className="doubles-dialog-backdrop">
      <div className="doubles-dialog">
        <div className="doubles-dialog-header">
          <div>
            <span>
              DESAFÍO DE DOBLES
            </span>

            <h3>
              Elegí tu pareja
            </h3>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
          >
            ×
          </button>
        </div>

        <div className="doubles-dialog-target">
          <span>
            PAREJA DESAFIADA
          </span>

          <strong>
            {
              getPairName(
                targetPair,
              )
            }
          </strong>

          <small>
            Elo {
              targetPair.rating
            }
          </small>
        </div>

        <label className="doubles-dialog-select">
          <span>
            COMPETÍS CON
          </span>

          <select
            value={
              selectedPairId
            }
            onChange={
              (
                event,
              ) =>
                onSelectedPairId(
                  event.target
                    .value,
                )
            }
            disabled={
              sending
            }
          >
            <option value="">
              Seleccionar pareja
            </option>

            {ownPairs.map(
              (
                pair,
              ) => (
                <option
                  value={
                    pair.id
                  }
                  key={
                    pair.id
                  }
                >
                  {
                    getPairName(
                      pair,
                    )
                  } · Elo {
                    pair.rating
                  }
                </option>
              ),
            )}
          </select>
        </label>

        {ownPairs.length ===
          0 && (
          <div className="doubles-dialog-warning">
            Ninguna de tus parejas puede
            enfrentar a esta pareja. Los
            dos lados deben tener cuatro
            jugadores distintos.
          </div>
        )}

        <div className="doubles-dialog-actions">
          <button
            type="button"
            className="doubles-primary-button"
            disabled={
              sending ||
              !selectedPairId
            }
            onClick={
              onConfirm
            }
          >
            {sending
              ? "ENVIANDO..."
              : "ENVIAR DESAFÍO"}
          </button>

          <button
            type="button"
            className="doubles-secondary-button"
            onClick={
              onClose
            }
            disabled={
              sending
            }
          >
            CANCELAR
          </button>
        </div>
      </div>
    </div>
  );
}


export default function RankingPage() {
  const {
    user,
  } =
    useAuth();

  const [
    params,
    setParams,
  ] =
    useSearchParams();

  const initialFormat =
    normalizeFormat(
      params.get(
        "format",
      ),
    );

  const initialGender =
    normalizeGender(
      params.get(
        "gender",
      ) ||
        user?.gender ||
        DEFAULT_GENDER,
    );

  const [
    format,
    setFormat,
  ] =
    useState(
      initialFormat,
    );

  const [
    gender,
    setGender,
  ] =
    useState(
      initialGender,
    );

  const [
    competition,
    setCompetition,
  ] =
    useState(null);

  const [
    officialPlayers,
    setOfficialPlayers,
  ] =
    useState([]);

  const [
    provisionalPlayers,
    setProvisionalPlayers,
  ] =
    useState([]);

  const [
    historicalRecords,
    setHistoricalRecords,
  ] =
    useState([]);

  const [
    availability,
    setAvailability,
  ] =
    useState({});

  const [
    myPairs,
    setMyPairs,
  ] =
    useState([]);

  const [
    eligiblePartners,
    setEligiblePartners,
  ] =
    useState([]);

  const [
    pairPanelOpen,
    setPairPanelOpen,
  ] =
    useState(false);

  const [
    selectedPartnerId,
    setSelectedPartnerId,
  ] =
    useState("");

  const [
    creatingPair,
    setCreatingPair,
  ] =
    useState(false);

  const [
    targetPair,
    setTargetPair,
  ] =
    useState(null);

  const [
    selectedChallengePairId,
    setSelectedChallengePairId,
  ] =
    useState("");

  const [
    challengingId,
    setChallengingId,
  ] =
    useState(null);

  const [
    message,
    setMessage,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    placementMatches,
    setPlacementMatches,
  ] =
    useState(
      DEFAULT_PLACEMENT_MATCHES,
    );


  const competitionLabel =
    useMemo(
      () => {
        const formatLabel =
          format ===
          "doubles"
            ? "Dobles"
            : "Singles";

        const genderLabel =
          gender ===
          "female"
            ? "Femenino"
            : "Masculino";

        return `${formatLabel} ${genderLabel}`;
      },
      [
        format,
        gender,
      ],
    );


  const isVerified =
    user
      ?.verification_status ===
    "verified";


  const canCompeteInSelectedGender =
    Boolean(
      user,
    ) &&
    user?.role !==
      "admin" &&
    user?.gender ===
      gender &&
    isVerified;


  const canUseSinglesChallenges =
    format ===
      "singles" &&
    canCompeteInSelectedGender;


  const canUseDoubles =
    format ===
      "doubles" &&
    canCompeteInSelectedGender;


  const allRankingEntries =
    useMemo(
      () => [
        ...officialPlayers,
        ...provisionalPlayers,
      ],
      [
        officialPlayers,
        provisionalPlayers,
      ],
    );


  const loadDoublesUserData =
    async (
      competitionId,
    ) => {
      if (
        !canUseDoubles ||
        !competitionId
      ) {
        setMyPairs(
          [],
        );

        setEligiblePartners(
          [],
        );

        return;
      }

      const [
        pairsResponse,
        partnersResponse,
      ] =
        await Promise.all([
          api.get(
            "/doubles/pairs",
            {
              params: {
                competition_id:
                  competitionId,
              },
            },
          ),

          api.get(
            "/doubles/pairs/eligible-partners",
            {
              params: {
                competition_id:
                  competitionId,
              },
            },
          ),
        ]);

      setMyPairs(
        pairsResponse
          .data
          ?.pairs ||
          [],
      );

      setEligiblePartners(
        partnersResponse
          .data
          ?.partners ||
          [],
      );
    };


  const load =
    async () => {
      try {
        setLoading(
          true,
        );

        setMessage(
          "",
        );

        setAvailability(
          {},
        );

        setParams({
          format,
          gender,
        });

        const query =
          `format=${encodeURIComponent(
            format,
          )}&gender=${encodeURIComponent(
            gender,
          )}`;

        const [
          rankingResponse,
          historicalResponse,
        ] =
          await Promise.all([
            api.get(
              `/ranking?${query}`,
            ),

            api.get(
              `/ranking/historical-elo?${query}`,
            ),
          ]);

        const rankingData =
          rankingResponse
            .data;

        const historicalData =
          historicalResponse
            .data;

        const resolvedCompetition =
          rankingData
            .competition ||
          null;

        setCompetition(
          resolvedCompetition,
        );

        const resolvedPlacementMatches =
          Number(
            rankingData
              .placement_matches,
          ) ||
          DEFAULT_PLACEMENT_MATCHES;

        setPlacementMatches(
          resolvedPlacementMatches,
        );

        const official =
          format ===
          "doubles"
            ? (
                rankingData
                  .official_pairs ||
                rankingData
                  .official_players ||
                []
              )
            : (
                rankingData
                  .official_players ||
                (
                  rankingData.players ||
                  []
                ).filter(
                  (
                    player,
                  ) =>
                    !player
                      .provisional,
                )
              );

        const provisional =
          format ===
          "doubles"
            ? (
                rankingData
                  .provisional_pairs ||
                rankingData
                  .provisional_players ||
                []
              )
            : (
                rankingData
                  .provisional_players ||
                (
                  rankingData.players ||
                  []
                ).filter(
                  (
                    player,
                  ) =>
                    player
                      .provisional,
                )
              );

        setOfficialPlayers(
          official,
        );

        setProvisionalPlayers(
          provisional,
        );

        setHistoricalRecords(
          historicalData
            .records ||
          [],
        );

        if (
          format ===
            "singles" &&
          canUseSinglesChallenges
        ) {
          try {
            const response =
              await api.get(
                "/challenge-availability",
                {
                  params: {
                    competition_id:
                      resolvedCompetition
                        ?.id,
                  },
                },
              );

            setAvailability(
              response
                .data
                ?.availability ||
              {},
            );
          } catch {
            setAvailability(
              {},
            );
          }
        }

        if (
          format ===
          "doubles"
        ) {
          try {
            await loadDoublesUserData(
              resolvedCompetition
                ?.id,
            );
          } catch (error) {
            setMyPairs(
              [],
            );

            setEligiblePartners(
              [],
            );

            if (
              canUseDoubles
            ) {
              setMessage(
                error.response
                  ?.data
                  ?.message ||
                "No se pudieron cargar tus parejas.",
              );
            }
          }
        } else {
          setMyPairs(
            [],
          );

          setEligiblePartners(
            [],
          );

          setPairPanelOpen(
            false,
          );

          setTargetPair(
            null,
          );
        }
      } catch (error) {
        setCompetition(
          null,
        );

        setOfficialPlayers(
          [],
        );

        setProvisionalPlayers(
          [],
        );

        setHistoricalRecords(
          [],
        );

        setAvailability(
          {},
        );

        setMyPairs(
          [],
        );

        setEligiblePartners(
          [],
        );

        setMessage(
          error.response
            ?.data
            ?.message ||
            "No se pudo cargar el ranking",
        );
      } finally {
        setLoading(
          false,
        );
      }
    };


  useEffect(
    () => {
      load();
    },
    [
      format,
      gender,
      user?.id,
      user?.gender,
      user?.role,
      user
        ?.verification_status,
    ],
  );


  const createSinglesChallenge =
    async (
      challengedId,
    ) => {
      if (
        challengingId ||
        format !==
          "singles"
      ) {
        return;
      }

      try {
        setMessage(
          "",
        );

        setSuccessMessage(
          "",
        );

        setChallengingId(
          challengedId,
        );

        const {
          data,
        } =
          await api.post(
            "/challenges",
            {
              challenged_id:
                challengedId,

              competition_id:
                competition
                  ?.id,
            },
          );

        setSuccessMessage(
          data.message ||
          "Desafío enviado.",
        );

        await load();
      } catch (error) {
        setMessage(
          error.response
            ?.data
            ?.message ||
            "No se pudo crear el desafío",
        );

        await load();
      } finally {
        setChallengingId(
          null,
        );
      }
    };


  const createPair =
    async (
      event,
    ) => {
      event.preventDefault();

      if (
        !competition?.id ||
        !selectedPartnerId ||
        creatingPair
      ) {
        return;
      }

      try {
        setCreatingPair(
          true,
        );

        setMessage(
          "",
        );

        setSuccessMessage(
          "",
        );

        const {
          data,
        } =
          await api.post(
            "/doubles/pairs",
            {
              competition_id:
                competition.id,

              partner_user_id:
                Number(
                  selectedPartnerId,
                ),
            },
          );

        setSuccessMessage(
          data.message ||
          "Pareja formada correctamente.",
        );

        setSelectedPartnerId(
          "",
        );

        setPairPanelOpen(
          false,
        );

        await load();
      } catch (error) {
        setMessage(
          error.response
            ?.data
            ?.message ||
            "No se pudo formar la pareja.",
        );
      } finally {
        setCreatingPair(
          false,
        );
      }
    };


  const openPairChallenge = (
    pair,
  ) => {
    if (
      !canUseDoubles
    ) {
      return;
    }

    const eligibleOwnPairs =
      myPairs.filter(
        (
          ownPair,
        ) =>
          Number(
            ownPair.id,
          ) !==
            Number(
              pair.id,
            ) &&
          !pairsSharePlayer(
            ownPair,
            pair,
          ),
      );

    setTargetPair({
      ...pair,

      eligibleOwnPairs,
    });

    setSelectedChallengePairId(
      eligibleOwnPairs.length ===
        1
        ? String(
            eligibleOwnPairs[0]
              .id,
          )
        : "",
    );
  };


  const closePairChallenge =
    () => {
      if (
        challengingId
      ) {
        return;
      }

      setTargetPair(
        null,
      );

      setSelectedChallengePairId(
        "",
      );
    };


  const sendDoublesChallenge =
    async () => {
      if (
        !targetPair ||
        !selectedChallengePairId ||
        challengingId
      ) {
        return;
      }

      try {
        setMessage(
          "",
        );

        setSuccessMessage(
          "",
        );

        setChallengingId(
          targetPair.id,
        );

        const {
          data,
        } =
          await api.post(
            "/doubles/challenges",
            {
              competition_id:
                competition
                  ?.id,

              challenger_pair_id:
                Number(
                  selectedChallengePairId,
                ),

              challenged_pair_id:
                Number(
                  targetPair.id,
                ),
            },
          );

        setSuccessMessage(
          data.message ||
          "Desafío de dobles enviado.",
        );

        setTargetPair(
          null,
        );

        setSelectedChallengePairId(
          "",
        );

        await load();
      } catch (error) {
        setMessage(
          error.response
            ?.data
            ?.message ||
            "No se pudo enviar el desafío de dobles.",
        );
      } finally {
        setChallengingId(
          null,
        );
      }
    };


  const getPlayerAvailability =
    (
      player,
    ) => {
      let playerAvailability =
        availability[
          player.id
        ];

      if (
        user &&
        user.gender !==
          gender
      ) {
        playerAvailability = {
          can_challenge:
            false,

          reason:
            "different_league",

          message:
            "Solo podés desafiar jugadores de tu propia categoría.",
        };
      }

      if (
        user?.role ===
        "admin"
      ) {
        return null;
      }

      return playerAvailability;
    };


  const renderSinglesPlayer =
    (
      player,
    ) => {
      const sending =
        challengingId ===
        player.id;

      const playerAvailability =
        getPlayerAvailability(
          player,
        );

      const inactive =
        Boolean(
          player.inactive ??
            player.is_inactive,
        );

      const disabled =
        !playerAvailability
          ?.can_challenge ||
        Boolean(
          challengingId,
        );

      return (
        <div
          className={
            inactive
              ? "ranking-row inactive"
              : "ranking-row"
          }
          key={
            player.id
          }
        >
          <span className="rank-digit">
            {player.provisional
              ? "PROV."
              : String(
                  player
                    .rank_position ??
                    player
                      .official_position ??
                    "",
                ).padStart(
                  2,
                  "0",
                )}
          </span>

          <strong className="ranking-player-cell">
            <Link
              className="ranking-player-link"
              to={`/jugadores/${player.id}`}
            >
              {
                getPlayerName(
                  player,
                )
              }
            </Link>

            <PlayerFlags
              isYou={
                Number(
                  player.id,
                ) ===
                Number(
                  user?.id,
                )
              }
              provisional={
                player.provisional
              }
              inactive={
                inactive
              }
            />
          </strong>

          <span className="ranking-number">
            {
              player.rating
            }

            <small>
              ELO
            </small>
          </span>

          <span className="ranking-matches">
            {
              player
                .matches_played
            }

            {player.provisional
              ? `/${placementMatches}`
              : ""}
          </span>

          <span className="ranking-action-cell">
            {!user ||
            user?.role ===
              "admin" ? (
              "—"
            ) : (
              <span
                className={
                  disabled
                    ? "ranking-action-wrap disabled"
                    : "ranking-action-wrap"
                }
              >
                <button
                  type="button"
                  className="ranking-challenge-button"
                  disabled={
                    disabled
                  }
                  onClick={() =>
                    createSinglesChallenge(
                      player.id,
                    )
                  }
                >
                  {sending
                    ? "ENVIANDO..."
                    : "DESAFIAR"}
                </button>

                {disabled &&
                  playerAvailability
                    ?.message && (
                    <span className="ranking-tooltip">
                      {
                        playerAvailability
                          .message
                      }
                    </span>
                  )}
              </span>
            )}
          </span>
        </div>
      );
    };


  const renderDoublesPair =
    (
      pair,
    ) => {
      const isMyPair =
        pairContainsUser(
          pair,
          user?.id,
        );

      const eligibleOwnPairs =
        myPairs.filter(
          (
            ownPair,
          ) =>
            Number(
              ownPair.id,
            ) !==
              Number(
                pair.id,
              ) &&
            !pairsSharePlayer(
              ownPair,
              pair,
            ),
        );

      const canChallenge =
        canUseDoubles &&
        !isMyPair &&
        eligibleOwnPairs.length >
          0;

      const sending =
        challengingId ===
        pair.id;

      return (
        <div
          className={
            isMyPair
              ? "ranking-row doubles-ranking-row my-pair"
              : "ranking-row doubles-ranking-row"
          }
          key={
            pair.id
          }
        >
          <span className="rank-digit">
            {pair.provisional
              ? "PROV."
              : String(
                  pair
                    .rank_position ??
                    pair
                      .official_position ??
                    "",
                ).padStart(
                  2,
                  "0",
                )}
          </span>

          <strong className="ranking-player-cell doubles-ranking-pair-cell">
            <span className="doubles-ranking-pair-name">
              {
                getPairName(
                  pair,
                )
              }
            </span>

            <PairMembers
              pair={pair}
              currentUserId={
                user?.id
              }
            />

            <div className="doubles-row-flags">
              {isMyPair && (
                <em className="ranking-you">
                  TU PAREJA
                </em>
              )}

              {pair.provisional && (
                <small className="ranking-provisional">
                  NIVELATORIO
                </small>
              )}
            </div>
          </strong>

          <span className="ranking-number">
            {
              pair.rating
            }

            <small>
              ELO
            </small>
          </span>

          <span className="ranking-matches">
            {
              pair
                .matches_played
            }

            {pair.provisional
              ? `/${placementMatches}`
              : ""}
          </span>

          <span className="ranking-action-cell">
            {!user ||
            user?.role ===
              "admin" ? (
              "—"
            ) : isMyPair ? (
              <span className="doubles-own-label">
                TU PAREJA
              </span>
            ) : !canUseDoubles ? (
              <span className="doubles-blocked-label">
                NO DISPONIBLE
              </span>
            ) : (
              <button
                type="button"
                className="ranking-challenge-button"
                disabled={
                  !canChallenge ||
                  Boolean(
                    challengingId,
                  )
                }
                onClick={() =>
                  openPairChallenge(
                    pair,
                  )
                }
              >
                {sending
                  ? "ENVIANDO..."
                  : "DESAFIAR"}
              </button>
            )}
          </span>
        </div>
      );
    };


  const renderHistoricalRecord =
    (
      record,
      index,
    ) => {
      const isPair =
        format ===
        "doubles";

      return (
        <article
          className={`historical-elo-card historical-place-${index + 1}`}
          key={
            isPair
              ? `pair-${record.pair_id ?? record.id}`
              : record.id
          }
        >
          <div className="historical-card-top">
            <span className="historical-position">
              #{index + 1} HISTÓRICO
            </span>

            <span className="historical-medal">
              {index + 1}
            </span>
          </div>

          {isPair ? (
            <div className="historical-pair-name">
              {
                getPairName(
                  record,
                )
              }
            </div>
          ) : (
            <Link
              className="historical-player-name"
              to={`/jugadores/${record.id}`}
            >
              {
                getPlayerName(
                  record,
                )
              }
            </Link>
          )}

          {isPair && (
            <PairMembers
              pair={
                record
              }
              currentUserId={
                user?.id
              }
            />
          )}

          <div className="historical-record-number">
            {
              record
                .peak_elo
            }

            <small>
              ELO
            </small>
          </div>

          <div className="historical-record-meta">
            <span>
              Récord alcanzado
            </span>

            <strong>
              {formatRecordDate(
                record
                  .peak_reached_at,
              )}
            </strong>
          </div>

          <div className="historical-current">
            Elo actual

            <strong>
              {
                record
                  .current_elo
              }
            </strong>
          </div>
        </article>
      );
    };


  const displayedOwnPairs =
    myPairs.filter(
      (
        pair,
      ) =>
        Number(
          pair.competition_id,
        ) ===
        Number(
          competition?.id,
        ),
    );


  const challengeDialogOwnPairs =
    targetPair
      ?.eligibleOwnPairs ||
    [];


  return (
    <main className="page-dark ranking-page">
      <div className="site-width page-content">

        <section className="ranking-hero">
          <div className="ranking-hero-copy">
            <div className="ranking-brand-tags">
              <span>
                LA RED
              </span>

              <span>
                TENIS
              </span>

              <span>
                SAN PEDRO
              </span>
            </div>

            <span className="ranking-kicker">
              CLASIFICACIÓN
            </span>

            <h1>
              Ranking
            </h1>

            <p>
              Singles y dobles tienen
              rankings independientes.
              En dobles el Elo pertenece
              a cada combinación concreta
              de pareja.
            </p>
          </div>

          <RankingSelector
            format={
              format
            }
            gender={
              gender
            }
            onFormatChange={
              setFormat
            }
            onGenderChange={
              setGender
            }
          />
        </section>


        <section className="ranking-current-competition">
          <div>
            <span>
              RANKING SELECCIONADO
            </span>

            <strong>
              {
                competitionLabel
              }
            </strong>
          </div>

          {competition && (
            <div className="ranking-current-meta">
              <span>
                {
                  competition.city
                }
              </span>

              <span>
                {competition.team_size ===
                2
                  ? "2 jugadores por lado"
                  : "1 jugador por lado"}
              </span>
            </div>
          )}
        </section>


        {!user && (
          <div className="notice ranking-notice">
            Podés consultar libremente
            los cuatro rankings. Iniciá
            sesión para competir.
          </div>
        )}


        {!isVerified &&
          user &&
          user.role !==
            "admin" && (
            <div className="notice ranking-notice">
              Tu cuenta todavía no está
              habilitada para competir.
              Podés consultar el ranking,
              pero no formar parejas ni
              enviar desafíos hasta estar
              verificado.
            </div>
          )}


        {user &&
          user.role !==
            "admin" &&
          user.gender !==
            gender && (
            <div className="notice ranking-notice">
              Estás viendo una categoría
              distinta a la tuya. Podés
              consultar el ranking pero
              no competir en ella.
            </div>
          )}


        {successMessage && (
          <div className="notice ranking-notice doubles-success-notice">
            {
              successMessage
            }
          </div>
        )}


        {message && (
          <div className="notice ranking-notice doubles-error-notice">
            {
              message
            }
          </div>
        )}


        {format ===
          "doubles" &&
          canUseDoubles && (
          <section className="doubles-control-section">
            <div className="doubles-control-heading">
              <div>
                <span>
                  TU COMPETENCIA
                </span>

                <h2>
                  Parejas
                </h2>

                <p>
                  Tu cuenta sigue siendo
                  individual. Podés formar
                  distintas parejas y cada
                  combinación mantiene su
                  propio Elo.
                </p>
              </div>

              <button
                type="button"
                className="doubles-form-pair-button"
                onClick={() => {
                  setPairPanelOpen(
                    (
                      current,
                    ) =>
                      !current,
                  );

                  setMessage(
                    "",
                  );

                  setSuccessMessage(
                    "",
                  );
                }}
              >
                {pairPanelOpen
                  ? "CERRAR"
                  : "+ FORMAR PAREJA"}
              </button>
            </div>

            <FormPairPanel
              open={
                pairPanelOpen
              }
              partners={
                eligiblePartners
              }
              selectedPartnerId={
                selectedPartnerId
              }
              onSelectedPartnerId={
                setSelectedPartnerId
              }
              onSubmit={
                createPair
              }
              creating={
                creatingPair
              }
              onClose={() => {
                setPairPanelOpen(
                  false,
                );

                setSelectedPartnerId(
                  "",
                );
              }}
            />

            <div className="doubles-my-pairs-heading">
              <span>
                MIS PAREJAS
              </span>

              <strong>
                {
                  displayedOwnPairs.length
                }
              </strong>
            </div>

            {displayedOwnPairs.length >
            0 ? (
              <div className="doubles-my-pairs-grid">
                {displayedOwnPairs.map(
                  (
                    pair,
                  ) => (
                    <DoublesPairCard
                      key={
                        pair.id
                      }
                      pair={
                        pair
                      }
                      currentUserId={
                        user?.id
                      }
                      placementMatches={
                        placementMatches
                      }
                    />
                  ),
                )}
              </div>
            ) : (
              <div className="doubles-no-pairs">
                <strong>
                  Todavía no formaste
                  ninguna pareja.
                </strong>

                <span>
                  Elegí un compañero para
                  entrar al ranking de
                  dobles.
                </span>
              </div>
            )}
          </section>
        )}


        {loading ? (
          <div className="notice ranking-notice">
            Cargando{" "}
            {
              competitionLabel
            }
            ...
          </div>
        ) : (
          <>
            <section className="historical-elo-section">
              <div className="historical-elo-heading">
                <div>
                  <span>
                    LA RED ·{" "}
                    {
                      competitionLabel.toUpperCase()
                    }
                  </span>

                  <h2>
                    Elo histórico
                  </h2>
                </div>

                <p>
                  Los tres Elo más altos
                  alcanzados dentro de
                  esta competición.
                </p>
              </div>

              {historicalRecords.length >
              0 ? (
                <div className="historical-elo-grid">
                  {
                    historicalRecords.map(
                      renderHistoricalRecord,
                    )
                  }
                </div>
              ) : (
                <div className="ranking-empty-card">
                  Todavía no hay récords
                  históricos en{" "}
                  {
                    competitionLabel
                  }
                  .
                </div>
              )}
            </section>


            <section className="ranking-section">
              <div className="ranking-section-heading">
                <div>
                  <span>
                    {
                      competitionLabel.toUpperCase()
                    }
                  </span>

                  <h2>
                    Ranking oficial
                  </h2>
                </div>

                <p>
                  {format ===
                  "doubles"
                    ? `Parejas que completaron sus ${placementMatches} partidos nivelatorios.`
                    : `Jugadores que completaron sus ${placementMatches} partidos nivelatorios.`}
                </p>
              </div>

              <div className="ranking-box">
                <div className="ranking-head">
                  <span>
                    #
                  </span>

                  <span>
                    {format ===
                    "doubles"
                      ? "PAREJA"
                      : "JUGADOR"}
                  </span>

                  <span>
                    ELO
                  </span>

                  <span>
                    PARTIDOS
                  </span>

                  <span>
                    ACCIÓN
                  </span>
                </div>

                {officialPlayers.length >
                0 ? (
                  officialPlayers.map(
                    format ===
                      "doubles"
                      ? renderDoublesPair
                      : renderSinglesPlayer,
                  )
                ) : (
                  <div className="ranking-empty">
                    Todavía no hay{" "}
                    {format ===
                    "doubles"
                      ? "parejas oficiales"
                      : "jugadores oficiales"}{" "}
                    en{" "}
                    {
                      competitionLabel
                    }
                    .
                  </div>
                )}
              </div>
            </section>


            {provisionalPlayers.length >
              0 && (
              <section className="ranking-section provisional-section">
                <div className="ranking-section-heading">
                  <div>
                    <span>
                      EN CLASIFICACIÓN
                    </span>

                    <h2>
                      Nivelatorios
                    </h2>
                  </div>

                  <p>
                    {format ===
                    "doubles"
                      ? "Estas parejas todavía están completando sus partidos de ubicación."
                      : "Estos jugadores todavía están completando sus partidos de ubicación."}
                  </p>
                </div>

                <div className="ranking-box">
                  <div className="ranking-head">
                    <span>
                      #
                    </span>

                    <span>
                      {format ===
                      "doubles"
                        ? "PAREJA"
                        : "JUGADOR"}
                    </span>

                    <span>
                      ELO
                    </span>

                    <span>
                      PARTIDOS
                    </span>

                    <span>
                      ACCIÓN
                    </span>
                  </div>

                  {
                    provisionalPlayers.map(
                      format ===
                        "doubles"
                        ? renderDoublesPair
                        : renderSinglesPlayer,
                    )
                  }
                </div>
              </section>
            )}


            {format ===
              "doubles" &&
              allRankingEntries.length ===
                0 && (
              <section className="doubles-first-pair-cta">
                <span>
                  DOBLES
                </span>

                <h2>
                  El ranking empieza con
                  las parejas.
                </h2>

                <p>
                  Cuando una combinación
                  se forma, aparece de
                  inmediato como
                  provisional con 0/
                  {placementMatches} partidos.
                </p>

                {canUseDoubles && (
                  <button
                    type="button"
                    className="doubles-primary-button"
                    onClick={() =>
                      setPairPanelOpen(
                        true,
                      )
                    }
                  >
                    FORMAR LA PRIMERA PAREJA
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>


      <ChallengePairDialog
        targetPair={
          targetPair
        }
        ownPairs={
          challengeDialogOwnPairs
        }
        selectedPairId={
          selectedChallengePairId
        }
        onSelectedPairId={
          setSelectedChallengePairId
        }
        onConfirm={
          sendDoublesChallenge
        }
        onClose={
          closePairChallenge
        }
        sending={
          Boolean(
            challengingId,
          )
        }
      />
    </main>
  );
}