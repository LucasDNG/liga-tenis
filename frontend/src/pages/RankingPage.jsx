import {
  useEffect,
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


const PLACEMENT_MATCHES = 5;


const formatRecordDate = (
  value,
) => {
  if (!value) {
    return "Récord previo";
  }

  const date =
    new Date(value);

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
  ).format(date);
};


function ChallengeButton({
  player,
  availability,
  sending,
  anySending,
  onChallenge,
}) {
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

  const initial =
    params.get(
      "gender",
    ) ||
    user?.gender ||
    "male";

  const [
    league,
    setLeague,
  ] =
    useState(
      initial,
    );

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
      PLACEMENT_MATCHES,
    );


  const load =
    async () => {
      try {
        setLoading(
          true,
        );

        setMessage(
          "",
        );

        setParams({
          gender:
            league,
        });

        const [
          rankingResponse,
          historicalResponse,
        ] =
          await Promise.all([
            api.get(
              `/ranking?gender=${league}`,
            ),

            api.get(
              `/ranking/historical-elo?gender=${league}`,
            ),
          ]);

        const data =
          rankingResponse.data;

        setPlacementMatches(
          Number(
            data
              .placement_matches,
          ) ||
            PLACEMENT_MATCHES,
        );

        setOfficialPlayers(
          data
            .official_players ||
            (
              data.players ||
              []
            ).filter(
              (
                player,
              ) =>
                !player.provisional,
            ),
        );

        setProvisionalPlayers(
          data
            .provisional_players ||
            (
              data.players ||
              []
            ).filter(
              (
                player,
              ) =>
                player.provisional,
            ),
        );

        setHistoricalRecords(
          historicalResponse
            .data
            .records ||
            [],
        );

        if (
          user &&
          user.gender ===
            league &&
          user.role !==
            "admin"
        ) {
          try {
            const response =
              await api.get(
                "/challenge-availability",
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
        } else {
          setAvailability(
            {},
          );
        }
      } catch (error) {
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
      league,
      user?.id,
      user?.gender,
    ],
  );


  const challenge =
    async (
      id,
    ) => {
      if (
        challengingId
      ) {
        return;
      }

      try {
        setMessage(
          "",
        );

        setChallengingId(
          id,
        );

        const {
          data,
        } =
          await api.post(
            "/challenges",
            {
              challenged_id:
                id,
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
      let playerAvailability =
        availability[
          player.id
        ];

      if (
        user &&
        user.gender !==
          league
      ) {
        playerAvailability = {
          can_challenge:
            false,

          reason:
            "different_league",

          message:
            "Solo podés desafiar jugadores de tu propia liga.",
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
                    .rank_position,
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
                player.name
              }
            </Link>

            {(player.id ===
              user?.id ||
              inactive) && (
              <span className="ranking-player-flags">

                {player.id ===
                  user?.id && (
                  <em className="ranking-you">
                    VOS
                  </em>
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
            />
          </span>
        </div>
      );
    };


  return (
    <main className="page-dark ranking-page">
      <div className="site-width page-content">

        <section className="ranking-hero">

          <div>
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
              La competencia de
              La Red, actualizada
              partido a partido.
            </p>
          </div>


          <div className="league-switch">
            <button
              className={
                league ===
                "male"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague(
                  "male",
                )
              }
            >
              Masculina
            </button>

            <button
              className={
                league ===
                "female"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague(
                  "female",
                )
              }
            >
              Femenina
            </button>
          </div>

        </section>


        {!user && (
          <div className="notice ranking-notice">
            Podés consultar
            libremente el ranking
            y los perfiles. Iniciá
            sesión para desafiar
            jugadores.
          </div>
        )}


        {!isVerified &&
          user &&
          user.role !==
            "admin" && (
            <div className="notice ranking-notice">
              Tu cuenta todavía
              no está habilitada
              para competir. Podés
              consultar el ranking,
              pero los desafíos
              permanecerán bloqueados
              hasta que tu identidad
              sea verificada.
            </div>
          )}


        {message && (
          <div className="notice ranking-notice">
            {message}
          </div>
        )}


        {loading ? (
          <div className="notice ranking-notice">
            Cargando ranking...
          </div>
        ) : (
          <>

            <section className="historical-elo-section">

              <div className="historical-elo-heading">
                <div>
                  <span>
                    LA RED · RÉCORDS
                  </span>

                  <h2>
                    Elo histórico
                  </h2>
                </div>

                <p>
                  Los tres Elo más
                  altos alcanzados
                  por jugadores de
                  esta liga.
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
                            {index ===
                            0
                              ? "1"
                              : index ===
                                  1
                                ? "2"
                                : "3"}
                          </span>
                        </div>

                        <Link
                          className="historical-player-name"
                          to={`/jugadores/${record.id}`}
                        >
                          {
                            record.name
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
                <div className="notice ranking-notice">
                  Todavía no hay
                  récords históricos
                  en esta liga.
                </div>
              )}

            </section>


            <section className="ranking-section">

              <div className="ranking-section-heading">
                <div>
                  <span>
                    LA RED TENIS
                  </span>

                  <h2>
                    Ranking oficial
                  </h2>
                </div>

                <p>
                  Jugadores con
                  ubicación oficial
                  dentro de la liga.
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
                    jugadores con{" "}
                    {
                      placementMatches
                    }{" "}
                    partidos para formar
                    el ranking oficial.
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
                      Provisionales
                    </h2>
                  </div>

                  <p>
                    Ya forman parte
                    de La Red mientras
                    completan sus
                    primeros{" "}
                    {
                      placementMatches
                    }{" "}
                    partidos.
                  </p>
                </div>


                <div className="ranking-provisional-info">
                  <strong>
                    PROV
                  </strong>

                  <p>
                    Participan de los
                    desafíos desde que
                    están verificados.
                    Al completar{" "}
                    {
                      placementMatches
                    }{" "}
                    partidos pasan
                    automáticamente al
                    ranking oficial.
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

                  {provisionalPlayers.map(
                    renderPlayer,
                  )}

                </div>

              </section>
            )}

          </>
        )}

      </div>
    </main>
  );
}