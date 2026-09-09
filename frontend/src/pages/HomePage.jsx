import {
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import {
  api,
} from "../api";


const PLACEMENT_MATCHES = 5;


const RANKINGS = [
  {
    key:
      "singles-male",

    format:
      "singles",

    gender:
      "male",

    label:
      "Singles M",

    fullLabel:
      "Singles Masculino",
  },
  {
    key:
      "singles-female",

    format:
      "singles",

    gender:
      "female",

    label:
      "Singles F",

    fullLabel:
      "Singles Femenino",
  },
  {
    key:
      "doubles-male",

    format:
      "doubles",

    gender:
      "male",

    label:
      "Dobles M",

    fullLabel:
      "Dobles Masculino",
  },
  {
    key:
      "doubles-female",

    format:
      "doubles",

    gender:
      "female",

    label:
      "Dobles F",

    fullLabel:
      "Dobles Femenino",
  },
];


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


function WhatsAppIcon() {
  return (
    <svg
      className="whatsapp-home-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        d="M20.5 11.7a8.5 8.5 0 0 1-12.6 7.4L3 20.4l1.3-4.7a8.5 8.5 0 1 1 16.2-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M8.2 7.6c.2-.4.4-.4.7-.4h.5c.2 0 .4.1.5.4l.8 1.8c.1.3.1.5-.1.7l-.7.8c-.2.2-.1.4 0 .6.8 1.4 1.9 2.5 3.4 3.2.2.1.4.1.6-.1l.8-1c.2-.2.4-.3.7-.2l1.9.9c.3.1.4.3.4.6 0 .4-.2 1.3-.8 1.8-.6.5-1.5.8-2.4.6-1.2-.2-2.8-.8-4.8-2.5-1.7-1.5-2.8-3.3-3.1-4.4-.3-1.1 0-2.1.4-2.8Z"
        fill="currentColor"
      />
    </svg>
  );
}


export default function HomePage() {
  const [
    rankingKey,
    setRankingKey,
  ] =
    useState(
      "singles-male",
    );

  const [
    players,
    setPlayers,
  ] =
    useState([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    rankingError,
    setRankingError,
  ] =
    useState("");

  const [
    placementMatches,
    setPlacementMatches,
  ] =
    useState(
      PLACEMENT_MATCHES,
    );


  const selectedRanking =
    RANKINGS.find(
      (
        ranking,
      ) =>
        ranking.key ===
        rankingKey,
    ) ||
    RANKINGS[0];


  useEffect(
    () => {
      let active =
        true;

      const load =
        async () => {
          setLoading(
            true,
          );

          setRankingError(
            "",
          );

          try {
            const {
              data,
            } =
              await api.get(
                "/ranking",
                {
                  params: {
                    format:
                      selectedRanking.format,

                    gender:
                      selectedRanking.gender,
                  },
                },
              );

            if (!active) {
              return;
            }

            setPlacementMatches(
              Number(
                data.placement_matches,
              ) ||
                PLACEMENT_MATCHES,
            );

            /*
              El backend puede devolver:
              - players
              - official_players + provisional_players

              Para el Top 10 usamos "players" cuando
              existe porque conserva el orden oficial
              definido por el backend.

              Si no viene, armamos la lista con las
              dos colecciones disponibles.
            */

            const rankingPlayers =
              Array.isArray(
                data.players,
              )
                ? data.players
                : [
                    ...(
                      data.provisional_players ||
                      []
                    ),
                    ...(
                      data.official_players ||
                      []
                    ),
                  ];

            setPlayers(
              rankingPlayers.slice(
                0,
                10,
              ),
            );
          } catch (error) {
            if (!active) {
              return;
            }

            setPlayers(
              [],
            );

            setRankingError(
              error.response
                ?.data
                ?.message ||
                "No se pudo cargar este ranking.",
            );
          } finally {
            if (active) {
              setLoading(
                false,
              );
            }
          }
        };

      load();

      return () => {
        active =
          false;
      };
    },
    [
      selectedRanking.format,
      selectedRanking.gender,
    ],
  );


  const rankingUrl =
    `/ranking?format=${encodeURIComponent(
      selectedRanking.format,
    )}&gender=${encodeURIComponent(
      selectedRanking.gender,
    )}`;


  return (
    <main className="home-dark">

      <section className="league-strip" />

      <section className="home-main">
        <div className="site-width home-grid">

          <div className="hero-copy-dark">

            <div className="home-brand-tags">
              <span>
                LA RED
              </span>

              <span>
                LIGA DE TENIS
              </span>

              <span>
                SAN PEDRO
              </span>
            </div>


            <h1 className="home-title">
              <span className="home-title-main">
                La Red
              </span>

              <span className="home-title-city">
                Tenis · San Pedro
              </span>
            </h1>


            <p>
              Una liga abierta para
              jugadores de San Pedro.
              Desafiá, coordiná tu
              partido y competí para
              hacerte un lugar en
              La Red.
            </p>


            <div className="hero-actions-dark">

              <Link
                to="/ranking"
                className="btn-solid"
              >
                VER RANKING →
              </Link>

              <Link
                to="/register"
                className="btn-line"
              >
                QUIERO JUGAR
              </Link>

            </div>


            <div className="feature-line">

              <div>
                <b className="feature-icon">
                  ↥
                </b>

                <span>
                  <strong>
                    DESAFÍOS
                  </strong>

                  Competí dentro
                  de tu alcance
                  en el ranking
                </span>
              </div>


              <div>
                <b className="feature-icon whatsapp">
                  <WhatsAppIcon />
                </b>

                <span>
                  <strong>
                    COORDINACIÓN
                  </strong>

                  Contacto privado
                  por WhatsApp
                </span>
              </div>


              <div>
                <b className="feature-icon">
                  ✓
                </b>

                <span>
                  <strong>
                    RESULTADOS
                  </strong>

                  Carga y
                  confirmación
                  entre rivales
                </span>
              </div>


              <div>
                <b className="feature-icon">
                  ▥
                </b>

                <span>
                  <strong>
                    LA RED TENIS
                  </strong>

                  Ranking Elo
                  actualizado
                </span>
              </div>

            </div>
          </div>


          <section className="top-panel">

            <div className="top-panel-head">

              <div>
                <span>
                  LA RED · CLASIFICACIÓN
                </span>

                <h2>
                  TOP 10
                </h2>
              </div>


              <Link
                to={
                  rankingUrl
                }
              >
                Ver ranking completo →
              </Link>

            </div>


            <div
              className="league-switch"
              style={{
                gridTemplateColumns:
                  "repeat(4, minmax(0, 1fr))",
              }}
            >

              {RANKINGS.map(
                (
                  ranking,
                ) => (
                  <button
                    type="button"
                    key={
                      ranking.key
                    }
                    className={
                      rankingKey ===
                      ranking.key
                        ? "active"
                        : ""
                    }
                    title={
                      ranking.fullLabel
                    }
                    aria-label={
                      ranking.fullLabel
                    }
                    onClick={() =>
                      setRankingKey(
                        ranking.key,
                      )
                    }
                    style={{
                      padding:
                        "0 6px",

                      fontSize:
                        "11px",

                      whiteSpace:
                        "nowrap",
                    }}
                  >
                    {
                      ranking.label
                    }
                  </button>
                ),
              )}

            </div>


            <div className="top-list">

              {loading ? (

                <p className="dim">
                  Cargando ranking...
                </p>

              ) : rankingError ? (

                <p className="dim">
                  {
                    rankingError
                  }
                </p>

              ) : players.length ===
                0 ? (

                <p className="dim">
                  Todavía no hay
                  jugadores en{" "}
                  {
                    selectedRanking
                      .fullLabel
                  }.
                </p>

              ) : (

                players.map(
                  (
                    player,
                    index,
                  ) => {
                    const provisional =
                      Boolean(
                        player.provisional,
                      );

                    const position =
                      player.rank_position ??
                      player.official_position ??
                      index + 1;

                    return (
                      <div
                        className="top-row"
                        key={
                          `${selectedRanking.key}-${player.id}`
                        }
                      >
                        <span>
                          {provisional
                            ? "PROV."
                            : String(
                                position,
                              ).padStart(
                                2,
                                "0",
                              )}
                        </span>

                        <strong>
                          {getPlayerName(
                            player,
                          )}

                          {provisional && (
                            <small>
                              {" "}
                              ·{" "}
                              {
                                Number(
                                  player.matches_played,
                                ) ||
                                0
                              }
                              /
                              {
                                placementMatches
                              }
                            </small>
                          )}
                        </strong>

                        <b>
                          {
                            Number(
                              player.rating,
                            ) ||
                            0
                          }

                          {" "}

                          <small>
                            ELO
                          </small>
                        </b>
                      </div>
                    );
                  },
                )

              )}

            </div>
          </section>

        </div>
      </section>


      <section className="how-section">

        <div className="site-width how-grid">

          <div className="how-title">

            <span>
              LA RED SAN PEDRO
            </span>

            <p>
              Tenis local.
              Competencia clara.
              Una liga entre jugadores
              de la ciudad.
            </p>

          </div>


          <div className="how-step">

            <b>
              1
            </b>

            <div>
              <h3>
                Desafiá a un rival
              </h3>

              <p>
                La Red te muestra
                automáticamente qué
                jugadores están dentro
                de tu alcance.
              </p>
            </div>

          </div>


          <div className="how-step">

            <b>
              2
            </b>

            <div>
              <h3>
                Coordinen el partido
              </h3>

              <p>
                Acordá cancha, fecha
                y horario con tu rival
                y registren el encuentro.
              </p>
            </div>

          </div>


          <div className="how-step">

            <b>
              3
            </b>

            <div>
              <h3>
                Jugá y subí en La Red
              </h3>

              <p>
                Carguen el resultado,
                confírmenlo entre ambos
                y el ranking Elo se
                actualiza.
              </p>
            </div>

          </div>

        </div>
      </section>


      <footer className="home-footer">
        <div className="home-footer-brand">
          <strong>
            LA RED
          </strong>

          <span>
            LIGA DE TENIS
          </span>

          <span>
            SAN PEDRO
          </span>
        </div>

        <small>
          LA RED TENIS · SAN PEDRO · 2026
        </small>
      </footer>

    </main>
  );
}