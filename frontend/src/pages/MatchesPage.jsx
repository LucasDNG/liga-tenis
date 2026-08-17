import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const emptyScore = () => [{ p1: "", p2: "" }, { p1: "", p2: "" }];

export default function MatchesPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});
  const [message, setMessage] = useState("");

  const load = () => api.get("/matches").then(({ data }) => setMatches(data.matches));
  useEffect(() => { load(); }, []);

  const change = (id, setIndex, side, value) => {
    setScores((prev) => {
      const current = prev[id] || emptyScore();
      const next = current.map((s) => ({ ...s }));
      next[setIndex][side] = value;

      if (next.length === 2) {
        const a = Number(next[0].p1), b = Number(next[0].p2);
        const c = Number(next[1].p1), d = Number(next[1].p2);
        if (next[0].p1 !== "" && next[0].p2 !== "" && next[1].p1 !== "" && next[1].p2 !== "") {
          const split = (a > b && c < d) || (a < b && c > d);
          if (split) next.push({ p1: "", p2: "" });
        }
      }
      return { ...prev, [id]: next };
    });
  };

  const submit = async (id) => {
    const score = (scores[id] || emptyScore()).map((s) => ({
      p1: Number(s.p1),
      p2: Number(s.p2),
    }));

    try {
      const { data } = await api.patch(`/matches/${id}/result`, { score });
      setMessage(data.message);
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || "No se pudo enviar el resultado");
    }
  };

  const confirm = async (id) => {
    const { data } = await api.patch(`/matches/${id}/confirm`);
    setMessage(data.message);
    load();
  };

  const reject = async (id) => {
    const { data } = await api.patch(`/matches/${id}/reject-result`);
    setMessage(data.message);
    load();
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading"><div><span>PARTIDOS</span><h1>Mis partidos</h1></div></div>
        {message && <div className="notice">{message}</div>}

        <div className="cards-dark">
          {matches.length === 0 && <div className="empty-dark">Todavía no tenés partidos.</div>}
          {matches.map((m) => {
            const submittedByMe = m.result_submitted_by === user?.id;
            const score = scores[m.id] || emptyScore();
            const rivalPhone = m.player1_id === user?.id ? m.player2_phone : m.player1_phone;

            return (
              <article className="card-dark match-dark" key={m.id}>
                <div className="match-head">
                  <div><span className="card-label">PARTIDO</span><h2>{m.player1_name} <i>vs</i> {m.player2_name}</h2></div>
                  <span className={`status-dark ${m.status}`}>{m.status}</span>
                </div>

                {rivalPhone && <a className="whatsapp" target="_blank" href={`https://wa.me/54${rivalPhone.replace(/\D/g, "")}`}>Coordinar por WhatsApp</a>}

                {m.status === "pending" && (
                  <div className="score-editor">
                    <div className="score-row score-title"><span>Set</span><span>{m.player1_name}</span><span>{m.player2_name}</span></div>
                    {score.map((set, i) => (
                      <div className="score-row" key={i}>
                        <span>Set {i + 1}</span>
                        <input type="number" min="0" value={set.p1} onChange={(e) => change(m.id, i, "p1", e.target.value)} />
                        <input type="number" min="0" value={set.p2} onChange={(e) => change(m.id, i, "p2", e.target.value)} />
                      </div>
                    ))}
                    <button className="small-action" onClick={() => submit(m.id)}>Enviar resultado</button>
                  </div>
                )}

                {m.status === "awaiting_confirmation" && (
                  <div className="proposed">
                    <strong>Resultado propuesto</strong>
                    <pre>{JSON.stringify(m.proposed_score)}</pre>
                    {submittedByMe ? (
                      <p className="dim">Esperando confirmación del rival.</p>
                    ) : (
                      <div className="card-actions">
                        <button className="small-action" onClick={() => confirm(m.id)}>Confirmar</button>
                        <button className="small-action secondary" onClick={() => reject(m.id)}>Rechazar</button>
                      </div>
                    )}
                  </div>
                )}

                {m.status === "completed" && (
                  <div className="completed-score">
                    <p>Ganador: <strong>{m.winner_name}</strong></p>
                    <p>Resultado: {JSON.stringify(m.score)}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
