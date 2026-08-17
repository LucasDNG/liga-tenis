import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function RankingPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const initial = params.get("gender") || user?.gender || "male";
  const [league, setLeague] = useState(initial);
  const [players, setPlayers] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setParams({ gender: league });
    api.get(`/ranking?gender=${league}`)
      .then(({ data }) => setPlayers(data.players))
      .catch((error) => setMessage(error.response?.data?.message || "No se pudo cargar el ranking"));
  }, [league]);

  const challenge = async (id) => {
    try {
      const { data } = await api.post("/challenges", { challenged_id: id });
      setMessage(data.message);
    } catch (error) {
      setMessage(error.response?.data?.message || "No se pudo crear el desafío");
    }
  };

  const myPosition = players.find((p) => p.id === user?.id)?.rank_position;

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading">
          <div>
            <span>CLASIFICACIÓN</span>
            <h1>Ranking</h1>
          </div>
          <div className="league-switch">
            <button className={league === "male" ? "active" : ""} onClick={() => setLeague("male")}>Masculina</button>
            <button className={league === "female" ? "active" : ""} onClick={() => setLeague("female")}>Femenina</button>
          </div>
        </div>

        {message && <div className="notice">{message}</div>}

        <div className="ranking-box">
          <div className="ranking-head"><span>#</span><span>Jugador</span><span>Elo</span><span>Partidos</span><span>Acción</span></div>
          {players.map((player) => {
            const canChallenge =
              user &&
              user.gender === league &&
              player.id !== user.id &&
              myPosition &&
              player.rank_position < myPosition &&
              myPosition - player.rank_position <= 3;

            return (
              <div className="ranking-row" key={player.id}>
                <span className="rank-digit">{String(player.rank_position).padStart(2, "0")}</span>
                <strong>{player.name}{player.id === user?.id && <em> VOS</em>}</strong>
                <span>{player.rating}</span>
                <span>{player.matches_played}</span>
                <span>{canChallenge ? <button className="small-action" onClick={() => challenge(player.id)}>Desafiar</button> : "—"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
