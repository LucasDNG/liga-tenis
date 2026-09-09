import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  api,
} from "../api";

import {
  useAuth,
} from "../context/AuthContext";

import "./RankingPage.css";


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


function ChallengeButton({
  player,
  availability,
  sending,
  anySending,
  onChallenge,
  format,
}) {
  if (
    format ===
    "doubles"
  ) {
    return (
      <span className="ranking-coming-soon">
        PRÓXIMAMENTE
      </span>
    );
  }

  if (!availability) {
    return "—";
  }

  const disabled =
    !availability.can_challenge ||
    anySending;

  return (
    <span
      className={
        disabled
          ? "ranking-action-wrap disabled"
          : "ranking-action-wrap"
      }
      tabIndex={
        disabled
          ? 0
          : undefined
      }
    >
      <button
        type="button"
        className="ranking-challenge-button"
        disabled={disabled}
        onClick={() =>
          onChallenge(
            player.id,
          )
        }
      >
        {sending
          ? "ENVIANDO..."
          : "DESAFIAR"}
      </button>

      {disabled &&
        availability.message && (
          <span className="ranking-tooltip">
            {
              availability.message
            }
          </span>
        )}
    </span>
  );
}


export default function RankingPage() {
  const {
    user,
  } =
    useAuth();

  const navigate =
    useNavigate();

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
    message,
    setMessage,
  ] =
    useState("");

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    challengingId,
    setChallengingId,
  ] =
    useState(null);

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


  const canUseChallenges =
    format ===
      "singles" &&
    Boolean(
      user,
    ) &&
    user?.role !==
      "admin" &&
    user?.gender ===
      gender;


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
          rankingResponse.data;

        const historicalData =
          historicalResponse.data;

        setCompetition(
          rankingData
            .competition ||
            null,
        );

        setPlacementMatches(
          Number(
            rankingData
              .placement_matches,
          ) ||
            DEFAULT_PLACEMENT_MATCHES,
        );

        setOfficialPlayers(
          rankingData
            .official_players ||
            (
              rankingData.players ||
              []
            ).filter(
              (
                player,
              ) =>
                !player.provisional,
            ),
        );

        setProvisionalPlayers(
          rankingData
            .provisional_players ||
            (
              rankingData.players ||
              []
            ).filter(
              (
                player,
              ) =>
                player.provisional,
            ),
        );

        setHistoricalRecords(
          historicalData
            .records ||
            [],
        );

        /*
          Los desafíos actuales son singles.

          No consultamos disponibilidad
          en dobles hasta que exista el flujo
          de selección/formación de pareja.
        */

        if (
          canUseChallenges
        ) {
          try {
            const response =
              await api.get(
                "/challenge-availability",
                {
                  params: {
                    competition_id:
                      rankingData
                        .competition
                        ?.id,
                  },
                },
              );

            setAvailability(
              response.data
                .availability ||
                {},
            );
          } catch {
            setAvailability(
              {},
            );
          }
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
    ],
  );


  const challenge =
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

        navigate(
          "/challenges",
          {
            state: {
              message:
                data.message,
            },
          },
        );
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


  const isVerified =
    user
      ?.verification_status ===
    "verified";


  const getPlayerAvailability =
    (
      player,
    ) => {
      if (
        format ===
        "doubles"
      ) {
        return null;
      }

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


  const renderPlayer =
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

            {(player.id ===
              user?.id ||
              inactive ||
              player.provisional) && (
              <span className="ranking-player-flags">
                {player.id ===
                  user?.id && (
                  <em className="ranking-you">
                    VOS
                  </em>
                )}

                {player.provisional && (
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
            )}
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
            <ChallengeButton
              player={
                player
              }
              availability={
                user
                  ? playerAvailability
                  : null
              }
              sending={
                sending
              }
              anySending={
                Boolean(
                  challengingId,
                )
              }
              onChallenge={
                challenge
              }
              format={
                format
              }
            />
          </span>
        </div>
      );
    };


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
              Cuatro competencias
              independientes. Cada
              modalidad conserva su
              propio Elo, partidos,
              nivelatorios y posiciones.
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


        {format ===
          "doubles" && (
          <div className="notice ranking-notice ranking-doubles-notice">
            El ranking individual de
            dobles ya está separado de
            singles. La creación de
            desafíos de dobles se
            habilitará cuando quede
            definido el armado de pareja
            y la distribución Elo entre
            compañeros.
          </div>
        )}


        {!user && (
          <div className="notice ranking-notice">
            Podés consultar libremente
            los cuatro rankings y los
            perfiles. Iniciá sesión para
            competir.
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
              pero los desafíos
              permanecerán bloqueados
              hasta que tu identidad sea
              verificada.
            </div>
          )}


        {message && (
          <div className="notice ranking-notice">
            {message}
          </div>
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
                  {historicalRecords.map(
                    (
                      record,
                      index,
                    ) => (
                      <article
                        className={`historical-elo-card historical-place-${index + 1}`}
                        key={
                          record.id
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
                    ),
                  )}
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
                  Jugadores que ya
                  completaron sus{" "}
                  {
                    placementMatches
                  }{" "}
                  partidos nivelatorios
                  en esta competición.
                </p>
              </div>


              <div className="ranking-box">

                <div className="ranking-head">
                  <span>
                    #
                  </span>

                  <span>
                    JUGADOR
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
                    renderPlayer,
                  )
                ) : (
                  <div className="ranking-empty">
                    Todavía no hay
                    jugadores oficiales
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
                    Estos jugadores
                    todavía están
                    completando sus{" "}
                    {
                      placementMatches
                    }{" "}
                    partidos de
                    ubicación en{" "}
                    {
                      competitionLabel
                    }
                    .
                  </p>
                </div>


                <div className="ranking-box">

                  <div className="ranking-head">
                    <span>
                      #
                    </span>

                    <span>
                      JUGADOR
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
                      renderPlayer,
                    )
                  }

                </div>

              </section>
            )}

          </>
        )}

      </div>
    </main>
  );
}