import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

const leagueName = {
  male: "Masculina",
  female: "Femenina",
};

export default function HomePage() {
  const [league, setLeague] = useState("male");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/ranking?gender=${league}`);
        setPlayers(data.players.slice(0, 10));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [league]);

  return (
    <main className="home-dark">
      <section className="league-strip"></section>

      <section className="home-main">
        <div className="site-width home-grid">
          <div className="hero-copy-dark">
            <h1>
              El Ranking
              <span>San Pedro</span>
            </h1>

            <p>
              Una liga abierta para jugadores de la ciudad. Desafiá, coordiná el
              partido con tu rival y competí por subir en el ranking.
            </p>

            <div className="hero-actions-dark">
              <Link to="/ranking" className="btn-solid">
                VER RANKING →
              </Link>
              <Link to="/register" className="btn-line">
                QUIERO JUGAR
              </Link>
            </div>

            <div className="feature-line">
              <div>
                <b>↥</b>
                <span>
                  <strong>DESAFÍOS</strong>Hasta 3 puestos por encima
                </span>
              </div>
              <div>
                <b>◉</b>
                <span>
                  <strong>COORDINACIÓN</strong>Contacto por WhatsApp
                </span>
              </div>
              <div>
                <b>✓</b>
                <span>
                  <strong>RESULTADOS</strong>Carga y confirmación
                </span>
              </div>
              <div>
                <b>▥</b>
                <span>
                  <strong>RANKING</strong>Sistema Elo actualizado
                </span>
              </div>
            </div>
          </div>

          <section className="top-panel">
            <div className="top-panel-head">
              <div>
                <span>CLASIFICACIÓN</span>
                <h2>TOP 10</h2>
              </div>

              <Link to={`/ranking?gender=${league}`}>
                Ver ranking completo →
              </Link>
            </div>

            <div className="league-switch">
              {["male", "female"].map((value) => (
                <button
                  key={value}
                  className={league === value ? "active" : ""}
                  onClick={() => setLeague(value)}
                >
                  Liga {leagueName[value]}
                </button>
              ))}
            </div>

            <div className="top-list">
              {loading ? (
                <p className="dim">Cargando ranking...</p>
              ) : players.length === 0 ? (
                <p className="dim">Todavía no hay jugadores en esta liga.</p>
              ) : (
                players.map((player) => (
                  <div className="top-row" key={player.id}>
                    <span>{String(player.rank_position).padStart(2, "0")}</span>
                    <strong>{player.name}</strong>
                    <b>
                      {player.rating} <small>ELO</small>
                    </b>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="how-section">
        <div className="site-width how-grid">
          <div className="how-title">
            <span>¿CÓMO FUNCIONA LA LIGA?</span>
            <p>Simple. Entre jugadores de San Pedro.</p>
          </div>

          <div className="how-step">
            <b>1</b>
            <div>
              <h3>Desafiá a un rival</h3>
              <p>
                Podés desafiar hasta tres puestos por encima en tu misma liga.
              </p>
            </div>
          </div>
          <div className="how-step">
            <b>2</b>
            <div>
              <h3>Coordinen el partido</h3>
              <p>
                Al aceptar reciben el contacto para ponerse de acuerdo por
                WhatsApp.
              </p>
            </div>
          </div>
          <div className="how-step">
            <b>3</b>
            <div>
              <h3>Jueguen y carguen el resultado</h3>
              <p>El rival confirma el resultado y el ranking se actualiza.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">LIGA DE TENIS SAN PEDRO · 2026</footer>
    </main>
  );
}
