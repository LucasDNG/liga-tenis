import {
  useEffect,
  useState,
} from "react";

import { api } from "../api";

import "./PublicMatchesPage.css";

const formatDate = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(new Date(value));
};

const formatTime = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(new Date(value));
};

const formatScore = (score) => {
  if (!Array.isArray(score)) {
    return "";
  }

  return score
    .map(
      (set) =>
        `${set.p1}-${set.p2}`,
    )
    .join(" · ");
};

const eloLabel = (value) => {
  const number =
    Number(value);

  if (
    Number.isNaN(number)
  ) {
    return "";
  }

  return number > 0
    ? `+${number}`
    : `${number}`;
};

export default function PublicMatchesPage() {
  const [
    league,
    setLeague,
  ] = useState("male");

  const [
    upcoming,
    setUpcoming,
  ] = useState([]);

  const [
    results,
    setResults,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    message,
    setMessage,
  ] = useState("");

  useEffect(() => {
    const load =
      async () => {
        try {
          setLoading(true);
          setMessage("");

          const [
            upcomingResponse,
            resultsResponse,
          ] =
            await Promise.all([
              api.get(
                `/public/upcoming-matches?gender=${league}`,
              ),

              api.get(
                `/public/latest-results?gender=${league}`,
              ),
            ]);

          setUpcoming(
            upcomingResponse
              .data
              .matches || [],
          );

          setResults(
            resultsResponse
              .data
              .results || [],
          );
        } catch (error) {
          setMessage(
            error.response
              ?.data
              ?.message ||
              "No se pudo cargar la actividad de la liga.",
          );
        } finally {
          setLoading(false);
        }
      };

    load();
  }, [league]);

  return (
    <main className="public-matches-page">
      <div className="site-width public-matches-content">
        <header className="public-matches-header">
          <div>
            <span>
              TRANSPARENCIA
            </span>

            <h1>
              Partidos
            </h1>

            <p>
              Consultá cuándo y
              dónde se juegan los
              próximos encuentros
              y revisá los últimos
              resultados oficiales.
            </p>
          </div>

          <div className="public-league-switch">
            <button
              className={
                league === "male"
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
        </header>

        {message && (
          <div className="public-message">
            {message}
          </div>
        )}

        {loading ? (
          <div className="public-message">
            Cargando partidos...
          </div>
        ) : (
          <>
            <section className="public-section">
              <div className="public-section-title">
                <span>
                  PRÓXIMOS
                </span>

                <h2>
                  Próximos partidos
                </h2>

                <p>
                  Estos encuentros
                  ya fueron
                  coordinados y
                  aceptados por
                  ambos jugadores.
                </p>
              </div>

              {upcoming.length ===
              0 ? (
                <div className="public-empty">
                  No hay partidos
                  programados por
                  el momento.
                </div>
              ) : (
                <div className="upcoming-grid">
                  {upcoming.map(
                    (match) => (
                      <article
                        className="upcoming-card"
                        key={
                          match.id
                        }
                      >
                        <div className="court-line court-line-top" />

                        <span className="public-card-label">
                          PARTIDO PROGRAMADO
                        </span>

                        <div className="public-versus">
                          <strong>
                            {
                              match.player1_name
                            }
                          </strong>

                          <span>
                            VS
                          </span>

                          <strong>
                            {
                              match.player2_name
                            }
                          </strong>
                        </div>

                        <div className="match-public-data">
                          <div>
                            <small>
                              Fecha
                            </small>

                            <strong>
                              {formatDate(
                                match.scheduled_at,
                              )}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Hora
                            </small>

                            <strong>
                              {formatTime(
                                match.scheduled_at,
                              )}
                              {" hs"}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Lugar
                            </small>

                            <strong>
                              {
                                match.venue
                              }
                            </strong>
                          </div>
                        </div>

                        <div className="public-transparency-note">
                          Este partido
                          es público
                          para favorecer
                          la transparencia
                          de la Liga.
                        </div>

                        <div className="court-line court-line-bottom" />
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>

            <section className="public-section results-section">
              <div className="public-section-title">
                <span>
                  RESULTADOS
                </span>

                <h2>
                  Últimos resultados
                </h2>

                <p>
                  Solo aparecen
                  resultados
                  confirmados por
                  ambos jugadores.
                </p>
              </div>

              {results.length ===
              0 ? (
                <div className="public-empty">
                  Todavía no hay
                  resultados oficiales.
                </div>
              ) : (
                <div className="results-list">
                  {results.map(
                    (match) => (
                      <article
                        className="result-card"
                        key={
                          match.id
                        }
                      >
                        <div className="result-main">
                          <div>
                            <span className="public-card-label">
                              FINALIZADO
                            </span>

                            <h3>
                              {
                                match.player1_name
                              }

                              <i>
                                vs
                              </i>

                              {
                                match.player2_name
                              }
                            </h3>
                          </div>

                          <strong className="result-score">
                            {formatScore(
                              match.score,
                            )}
                          </strong>
                        </div>

                        <div className="result-details">
                          <div>
                            <small>
                              Ganador
                            </small>

                            <strong>
                              {
                                match.winner_name
                              }
                            </strong>
                          </div>

                          <div>
                            <small>
                              Fecha
                            </small>

                            <strong>
                              {formatDate(
                                match.completed_at,
                              )}
                            </strong>
                          </div>

                          <div>
                            <small>
                              Lugar
                            </small>

                            <strong>
                              {match.venue ||
                                "Sin especificar"}
                            </strong>
                          </div>
                        </div>

                        <div className="result-elo">
                          <div>
                            <span>
                              {
                                match.player1_name
                              }
                            </span>

                            <strong
                              className={
                                Number(
                                  match.player1_elo_change,
                                ) >= 0
                                  ? "elo-positive"
                                  : "elo-negative"
                              }
                            >
                              {eloLabel(
                                match.player1_elo_change,
                              )}
                              {" Elo"}
                            </strong>
                          </div>

                          <div>
                            <span>
                              {
                                match.player2_name
                              }
                            </span>

                            <strong
                              className={
                                Number(
                                  match.player2_elo_change,
                                ) >= 0
                                  ? "elo-positive"
                                  : "elo-negative"
                              }
                            >
                              {eloLabel(
                                match.player2_elo_change,
                              )}
                              {" Elo"}
                            </strong>
                          </div>
                        </div>
                      </article>
                    ),
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}