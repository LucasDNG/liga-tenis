import { useEffect, useState } from "react";

import { api } from "../api";

import "./PublicMatchesPage.css";

const formatDate = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",

    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
};

const formatTime = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,

    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
};

const formatScore = (score) => {
  if (!Array.isArray(score)) {
    return "";
  }

  return score.map((set) => `${set.p1}-${set.p2}`).join(" / ");
};

const eloLabel = (value) => {
  const number = Number(value);

  if (Number.isNaN(number)) {
    return "";
  }

  return number > 0 ? `+${number}` : `${number}`;
};

const genderLabel = (gender) => {
  return gender === "female" ? "FEMENINA" : "MASCULINA";
};

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 2v3M17 2v3M4 9h16M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M12 7v5l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21s6-6.1 6-12a6 6 0 1 0-12 0c0 5.9 6 12 6 12Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <circle
        cx="12"
        cy="9"
        r="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 19 6v5c0 4.5-2.6 7.7-7 10-4.4-2.3-7-5.5-7-10V6l7-3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 4h8v4c0 4-2 6-4 6s-4-2-4-6V4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M8 6H4c0 4 2 6 5 6M16 6h4c0 4-2 6-5 6M12 14v4M8 21h8M9 18h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function PublicMatchesPage() {
  const [league, setLeague] = useState("all");

  const [upcoming, setUpcoming] = useState([]);

  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(true);

  const [message, setMessage] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setMessage("");

        const genderQuery = league === "all" ? "" : `?gender=${league}`;

        const [upcomingResponse, resultsResponse] = await Promise.all([
          api.get(`/public/upcoming-matches${genderQuery}`),

          api.get(`/public/latest-results${genderQuery}`),
        ]);

        setUpcoming(upcomingResponse.data.matches || []);

        setResults(resultsResponse.data.results || []);
      } catch (error) {
        setMessage(
          error.response?.data?.message ||
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
      <section className="matches-hero">
        <div className="site-width matches-hero-inner">
          <div className="matches-hero-copy">
            <span className="matches-eyebrow">TRANSPARENCIA</span>

            <h1>Partidos</h1>

            <p>
              Consultá cuándo y dónde se juegan los encuentros de la Liga y
              revisá los últimos resultados oficiales.
            </p>
          </div>

          <div className="public-league-switch">
            <button
              className={league === "all" ? "active all" : ""}
              onClick={() => setLeague("all")}
            >
              <span>◉</span>
              Todos
            </button>

            <button
              className={league === "male" ? "active male" : ""}
              onClick={() => setLeague("male")}
            >
              <span>♂</span>
              Masculina
            </button>

            <button
              className={league === "female" ? "active female" : ""}
              onClick={() => setLeague("female")}
            >
              <span>♀</span>
              Femenina
            </button>
          </div>
        </div>
      </section>

      <div className="site-width public-matches-content">
        {message && <div className="public-message">{message}</div>}

        {loading ? (
          <div className="public-message">Cargando partidos...</div>
        ) : (
          <>
            <section className="matches-panel">
              <div className="panel-heading">
                <div className="panel-heading-icon">
                  <CalendarIcon />
                </div>

                <div>
                  <h2>Próximos partidos</h2>

                  <p>Encuentros coordinados y aceptados por ambos jugadores.</p>
                </div>
              </div>

              {upcoming.length === 0 ? (
                <div className="public-empty">
                  No hay partidos programados por el momento.
                </div>
              ) : (
                <div className="upcoming-grid">
                  {upcoming.map((match) => (
                    <article
                      className={`upcoming-card ${match.gender}`}
                      key={match.id}
                    >
                      <div className="match-card-top">
                        <span className="match-programmed">
                          PARTIDO PROGRAMADO
                        </span>

                        <span className="match-gender-badge">
                          {genderLabel(match.gender)}
                        </span>
                      </div>

                      <div className="match-versus">
                        <strong>{match.player1_name}</strong>

                        <div className="versus-center">
                          <span className="versus-line" />

                          <b>VS</b>

                          <span className="versus-line" />
                        </div>

                        <strong>{match.player2_name}</strong>
                      </div>

                      <div className="match-public-data">
                        <div>
                          <span className="data-icon">
                            <CalendarIcon />
                          </span>

                          <div>
                            <small>FECHA</small>

                            <strong>{formatDate(match.scheduled_at)}</strong>
                          </div>
                        </div>

                        <div>
                          <span className="data-icon">
                            <ClockIcon />
                          </span>

                          <div>
                            <small>HORA</small>

                            <strong>
                              {formatTime(match.scheduled_at)}
                              {" hs"}
                            </strong>
                          </div>
                        </div>

                        <div>
                          <span className="data-icon">
                            <LocationIcon />
                          </span>

                          <div>
                            <small>LUGAR</small>

                            <strong>{match.venue}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="public-transparency-note">
                        <ShieldIcon />

                        <span>
                          Partido público para favorecer la transparencia de la
                          Liga.
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="matches-panel results-panel">
              <div className="panel-heading">
                <div className="panel-heading-icon trophy">
                  <TrophyIcon />
                </div>

                <div>
                  <h2>Últimos resultados</h2>

                  <p>Solo aparecen resultados oficiales confirmados.</p>
                </div>
              </div>

              {results.length === 0 ? (
                <div className="public-empty">
                  Todavía no hay resultados oficiales.
                </div>
              ) : (
                <div className="results-list">
                  {results.map((match) => (
                    <article className="result-card" key={match.id}>
                      <div className="result-match">
                        <span className="finished-badge">FINALIZADO</span>

                        <div className="result-players">
                          <strong>{match.player1_name}</strong>

                          <span className="result-score">
                            {formatScore(match.score)}
                          </span>

                          <strong>{match.player2_name}</strong>
                        </div>
                      </div>

                      <div className="result-info">
                        <div className="result-details">
                          <div>
                            <small>GANADOR</small>

                            <strong>🏆 {match.winner_name}</strong>
                          </div>

                          <div>
                            <small>FECHA</small>

                            <strong>{formatDate(match.completed_at)}</strong>
                          </div>

                          <div>
                            <small>LUGAR</small>

                            <strong>{match.venue || "Sin especificar"}</strong>
                          </div>
                        </div>

                        <div className="result-elo">
                          <span className="elo-title">CAMBIOS DE ELO</span>

                          <div>
                            <p>
                              <strong className="elo-positive">
                                ↑ {eloLabel(match.player1_elo_change)}
                              </strong>

                              <span>{match.player1_name}</span>
                            </p>

                            <p>
                              <strong className="elo-negative">
                                ↓ {eloLabel(match.player2_elo_change)}
                              </strong>

                              <span>{match.player2_name}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <div className="matches-footer-note">
              <span>i</span>

              <p>
                Los horarios y lugares pueden estar sujetos a cambios. Te
                recomendamos confirmar los detalles con los jugadores.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

