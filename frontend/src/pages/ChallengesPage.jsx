import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ChallengesPage() {
  const { user } = useAuth();
  const [challenges, setChallenges] = useState([]);
  const [message, setMessage] = useState("");

  const load = () =>
    api.get("/challenges").then(({ data }) => setChallenges(data.challenges));

  useEffect(() => { load(); }, []);

  const action = async (id, type) => {
    try {
      const { data } = await api.patch(`/challenges/${id}/${type}`);
      setMessage(data.message);
      load();
    } catch (error) {
      setMessage(error.response?.data?.message || "No se pudo actualizar el desafío");
    }
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading"><div><span>TU LIGA</span><h1>Desafíos</h1></div></div>
        {message && <div className="notice">{message}</div>}

        <div className="cards-dark">
          {challenges.length === 0 && <div className="empty-dark">No tenés desafíos todavía.</div>}
          {challenges.map((c) => {
            const incoming = c.challenged_id === user?.id;
            const rivalName = incoming ? c.challenger_name : c.challenged_name;
            const rivalPhone = incoming ? c.challenger_phone : c.challenged_phone;

            return (
              <article key={c.id} className="card-dark">
                <div><span className="card-label">{incoming ? "TE DESAFIÓ" : "DESAFIASTE A"}</span><h2>{rivalName}</h2></div>
                <span className={`status-dark ${c.status}`}>{c.status}</span>
                {c.status === "accepted" && rivalPhone && (
                  <a className="whatsapp" href={`https://wa.me/54${rivalPhone.replace(/\D/g, "")}`} target="_blank">WhatsApp del rival</a>
                )}
                {incoming && c.status === "pending" && (
                  <div className="card-actions">
                    <button onClick={() => action(c.id, "accept")} className="small-action">Aceptar</button>
                    <button onClick={() => action(c.id, "reject")} className="small-action secondary">Rechazar</button>
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
