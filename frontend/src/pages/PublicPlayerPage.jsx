import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useParams,
} from "react-router-dom";

import { api } from "../api";

import "./PublicPlayerPage.css";

const formatDate = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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

const eloValue = (value) => {
  const number =
    Number(value);

  if (
    Number.isNaN(number)
  ) {
    return "0";
  }

  return number > 0
    ? `+${number}`
    : `${number}`;
};

const eventLabel = (
  event,
) => {
  if (
    event.event_type ===
    "match_result"
  ) {
    return event.elo_change > 0
      ? "Victoria"
      : "Derrota";
  }

  if (
    event.event_type ===
    "challenge_rejection"
  ) {
    return "Desafío rechazado";
  }

  if (
    event.event_type ===
    "admin_reversal"
  ) {
    return "Reversión administrativa";
  }

  if (
    event.event_type ===
    "admin_adjustment"
  ) {
    return "Ajuste administrativo";
  }

  return "Movimiento Elo";
};

export default function PublicPlayerPage() {
  const { id } =
    useParams();

  const [
    data,
    setData,
  ] = useState(null);

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

          const response =
            await api.get(
              `/public/players/${id}/history`,
            );

          setData(
            response.data,
          );
        } catch (error) {
          setMessage(
            error.response
              ?.data
              ?.message ||
              "No se pudo cargar el jugador.",
          );
        } finally {
          setLoading(false);
        }
      };

    load();
  }, [id]);

  if (loading) {
    return (
      <main className="public-player-page">
        <div className="site-width public-player-content">
          <div className="player-message">
            Cargando jugador...
          </div>
        </div>
      </main>
    );
  }

  if (
    message ||
    !data
  ) {
    return (
      <main className="public-player-page">
        <div className="site-width public-player-content">
          <div className="player-message">
            {message ||
              "Jugador no encontrado"}
          </div>
        </div>
      </main>
    );
  }

  const {
    player,
    stats,
    matches,
    elo_history,
  } = data;

  const total =
    Number(
      stats.completed_matches,
    ) || 0;

  const wins =
    Number(stats.wins) ||
    0;

  const losses =
    Number(stats.losses) ||
    0;

  const winRate =
    total > 0
      ? Math.round(
          (wins / total) *
            100,
        )
      : 0;

  return (
    <main className="public-player-page">
      <div className="site-width public-player-content">
        <div className="player-back">
          <Link to="/ranking">
            ← Volver al ranking
          </Link>
        </div>

        <header className="player-hero">
          <div>
            <span>
              PERFIL PÚBLICO
            </span>

            <h1>
              {player.name}
            </h1>

            <p>
              {player.gender ===
              "female"
                ? "Liga Femenina"
                : "Liga Masculina"}

              {" · "}

              {player.city}
            </p>
          </div>

          <div className="player-rating">
            <small>
              ELO ACTUAL
            </small>

            <strong>
              {player.rating}
            </strong>
          </div>
        </header>

        <section className="player-stats">
          <div>
            <span>
              Partidos
            </span>

            <strong>
              {total}
            </strong>
          </div>

          <div>
            <span>
              Victorias
            </span>

            <strong>
              {wins}
            </strong>
          </div>

          <div>
            <span>
              Derrotas
            </span>

            <strong>
              {losses}
            </strong>
          </div>

          <div>
            <span>
              Efectividad
            </span>

            <strong>
              {winRate}%
            </strong>
          </div>
        </section>

        <section className="player-section">
          <div className="player-section-title">
            <span>
              HISTORIAL
            </span>

            <h2>
              Partidos disputados
            </h2>
          </div>

          {matches.length ===
          0 ? (
            <div className="player-empty">
              Este jugador todavía
              no tiene partidos
              finalizados.
            </div>
          ) : (
            <div className="player-match-list">
              {matches.map(
                (match) => {
                  const won =
                    match.result ===
                    "win";

                  const rival =
                    match.player1_id ===
                    player.id
                      ? {
                          id:
                            match.player2_id,

                          name:
                            match.player2_name,
                        }
                      : {
                          id:
                            match.player1_id,

                          name:
                            match.player1_name,
                        };

                  return (
                    <article
                      className="player-match-card"
                      key={
                        match.id
                      }
                    >
                      <div className="player-match-result">
                        <span
                          className={
                            won
                              ? "player-win"
                              : "player-loss"
                          }
                        >
                          {won
                            ? "VICTORIA"
                            : "DERROTA"}
                        </span>

                        <strong>
                          vs{" "}

                          <Link
                            to={`/jugadores/${rival.id}`}
                          >
                            {
                              rival.name
                            }
                          </Link>
                        </strong>
                      </div>

                      <div className="player-match-score">
                        {formatScore(
                          match.score,
                        )}
                      </div>

                      <div className="player-match-meta">
                        <span>
                          {formatDate(
                            match.completed_at,
                          )}
                        </span>

                        <span>
                          {match.venue ||
                            "Lugar no registrado"}
                        </span>

                        <strong
                          className={
                            Number(
                              match.elo_change,
                            ) >= 0
                              ? "elo-positive"
                              : "elo-negative"
                          }
                        >
                          {eloValue(
                            match.elo_change,
                          )}
                          {" Elo"}
                        </strong>
                      </div>
                    </article>
                  );
                },
              )}
            </div>
          )}
        </section>

        <section className="player-section">
          <div className="player-section-title">
            <span>
              TRANSPARENCIA
            </span>

            <h2>
              Historial de Elo
            </h2>

            <p>
              Cada modificación del
              puntaje queda registrada.
            </p>
          </div>

          {elo_history.length ===
          0 ? (
            <div className="player-empty">
              Todavía no hay
              movimientos de Elo.
            </div>
          ) : (
            <div className="elo-history-list">
              {elo_history.map(
                (event) => (
                  <article
                    className="elo-history-row"
                    key={
                      event.id
                    }
                  >
                    <div>
                      <span>
                        {eventLabel(
                          event,
                        )}
                      </span>

                      <small>
                        {formatDate(
                          event.created_at,
                        )}
                      </small>
                    </div>

                    <div className="elo-history-numbers">
                      <small>
                        {
                          event.elo_before
                        }
                      </small>

                      <span>
                        →
                      </span>

                      <strong>
                        {
                          event.elo_after
                        }
                      </strong>
                    </div>

                    <strong
                      className={
                        Number(
                          event.elo_change,
                        ) >= 0
                          ? "elo-positive"
                          : "elo-negative"
                      }
                    >
                      {eloValue(
                        event.elo_change,
                      )}
                    </strong>
                  </article>
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}