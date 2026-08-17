import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const emptyScore = () => [
  { p1: "", p2: "" },
  { p1: "", p2: "" },
];

const statusLabels = {
  pending: "Pendiente",
  awaiting_confirmation: "Esperando confirmación",
  completed: "Finalizado",
};

const formatPhone = (phone) => {
  if (!phone) return "";

  let numbers = phone.replace(/\D/g, "");

  if (numbers.startsWith("0")) {
    numbers = numbers.slice(1);
  }

  if (numbers.length === 10) {
    const areaCode = numbers.slice(0, 4);
    const localNumber = numbers.slice(4);

    return `(${areaCode}) ${localNumber}`;
  }

  return numbers;
};

export default function MatchesPage() {
  const { user } = useAuth();

  const [matches, setMatches] = useState([]);
  const [scores, setScores] = useState({});
  const [message, setMessage] = useState("");

  const load = () =>
    api
      .get("/matches")
      .then(({ data }) => setMatches(data.matches));

  useEffect(() => {
    load();
  }, []);

  const change = (
    id,
    setIndex,
    side,
    value,
  ) => {
    setScores((prev) => {
      const current =
        prev[id] || emptyScore();

      const next = current.map((set) => ({
        ...set,
      }));

      next[setIndex][side] = value;

      if (next.length === 2) {
        const a = Number(next[0].p1);
        const b = Number(next[0].p2);

        const c = Number(next[1].p1);
        const d = Number(next[1].p2);

        if (
          next[0].p1 !== "" &&
          next[0].p2 !== "" &&
          next[1].p1 !== "" &&
          next[1].p2 !== ""
        ) {
          const split =
            (a > b && c < d) ||
            (a < b && c > d);

          if (split) {
            next.push({
              p1: "",
              p2: "",
            });
          }
        }
      }

      return {
        ...prev,
        [id]: next,
      };
    });
  };

  const submit = async (id) => {
    const score = (
      scores[id] || emptyScore()
    ).map((set) => ({
      p1: Number(set.p1),
      p2: Number(set.p2),
    }));

    try {
      const { data } = await api.patch(
        `/matches/${id}/result`,
        { score },
      );

      setMessage(data.message);

      load();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo enviar el resultado",
      );
    }
  };

  const confirm = async (id) => {
    try {
      const { data } = await api.patch(
        `/matches/${id}/confirm`,
      );

      setMessage(data.message);

      load();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo confirmar el resultado",
      );
    }
  };

  const reject = async (id) => {
    try {
      const { data } = await api.patch(
        `/matches/${id}/reject-result`,
      );

      setMessage(data.message);

      load();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo rechazar el resultado",
      );
    }
  };

  const renderScore = (
    matchScore,
    player1Name,
    player2Name,
  ) => {
    if (!Array.isArray(matchScore)) {
      return null;
    }

    return (
      <div
        style={{
          display: "grid",
          gap: "14px",
          marginTop: "16px",
        }}
      >
        {matchScore.map((set, index) => (
          <div
            key={index}
            style={{
              border: "1px solid #243529",
              background: "#0f1a13",
              padding: "16px",
            }}
          >
            <strong
              style={{
                display: "block",
                color: "#9bbe61",
                marginBottom: "12px",
                fontSize: "14px",
              }}
            >
              Set {index + 1}
            </strong>

            <div
              style={{
                display: "grid",
                gridTemplateColumns:
                  "1fr auto",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <span>
                {player1Name}
              </span>

              <strong>
                {set.p1}
              </strong>

              <span>
                {player2Name}
              </span>

              <strong>
                {set.p2}
              </strong>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading">
          <div>
            <span>PARTIDOS</span>

            <h1>
              Mis partidos
            </h1>
          </div>
        </div>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        <div className="cards-dark">
          {matches.length === 0 && (
            <div className="empty-dark">
              Todavía no tenés partidos.
            </div>
          )}

          {matches.map((m) => {
            const submittedByMe =
              m.result_submitted_by ===
              user?.id;

            const score =
              scores[m.id] ||
              emptyScore();

            const rivalPhone =
              m.player1_id === user?.id
                ? m.player2_phone
                : m.player1_phone;

            const cleanPhone =
              rivalPhone?.replace(
                /\D/g,
                "",
              );

            const formattedPhone =
              formatPhone(rivalPhone);

            const statusLabel =
              statusLabels[m.status] ||
              m.status;

            return (
              <article
                className="card-dark match-dark"
                key={m.id}
              >
                <div className="match-head">
                  <div>
                    <span className="card-label">
                      PARTIDO
                    </span>

                    <h2>
                      {m.player1_name}{" "}
                      <i>vs</i>{" "}
                      {m.player2_name}
                    </h2>
                  </div>

                  <span
                    className={`status-dark ${m.status}`}
                  >
                    {statusLabel}
                  </span>
                </div>

                {rivalPhone && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: "16px",
                      marginTop: "14px",
                    }}
                  >
                    <a
                      className="whatsapp"
                      style={{
                        marginTop: 0,
                      }}
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/54${cleanPhone}`}
                    >
                      Coordinar por WhatsApp
                    </a>

                    <span
                      style={{
                        color: "#c0c7c0",
                        fontSize: "13px",
                      }}
                    >
                      {formattedPhone}
                    </span>
                  </div>
                )}

                {m.status ===
                  "pending" && (
                  <div className="score-editor">
                    <div className="score-row score-title">
                      <span>
                        Set
                      </span>

                      <span>
                        {m.player1_name}
                      </span>

                      <span>
                        {m.player2_name}
                      </span>
                    </div>

                    {score.map(
                      (set, index) => (
                        <div
                          className="score-row"
                          key={index}
                        >
                          <span>
                            Set {index + 1}
                          </span>

                          <input
                            type="number"
                            min="0"
                            value={set.p1}
                            onChange={(e) =>
                              change(
                                m.id,
                                index,
                                "p1",
                                e.target
                                  .value,
                              )
                            }
                          />

                          <input
                            type="number"
                            min="0"
                            value={set.p2}
                            onChange={(e) =>
                              change(
                                m.id,
                                index,
                                "p2",
                                e.target
                                  .value,
                              )
                            }
                          />
                        </div>
                      ),
                    )}

                    <button
                      className="small-action"
                      onClick={() =>
                        submit(m.id)
                      }
                    >
                      Enviar resultado
                    </button>
                  </div>
                )}

                {m.status ===
                  "awaiting_confirmation" && (
                  <div className="proposed">
                    <strong
                      style={{
                        fontSize: "16px",
                      }}
                    >
                      Resultado propuesto
                    </strong>

                    {renderScore(
                      m.proposed_score,
                      m.player1_name,
                      m.player2_name,
                    )}

                    {submittedByMe ? (
                      <p
                        className="dim"
                        style={{
                          marginTop: "18px",
                        }}
                      >
                        Esperando confirmación
                        del rival.
                      </p>
                    ) : (
                      <div className="card-actions">
                        <button
                          className="small-action"
                          onClick={() =>
                            confirm(m.id)
                          }
                        >
                          Confirmar
                        </button>

                        <button
                          className="small-action secondary"
                          onClick={() =>
                            reject(m.id)
                          }
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {m.status ===
                  "completed" && (
                  <div className="completed-score">
                    <p>
                      Ganador:{" "}
                      <strong>
                        {m.winner_name}
                      </strong>
                    </p>

                    <strong
                      style={{
                        display: "block",
                        marginTop: "18px",
                      }}
                    >
                      Resultado final
                    </strong>

                    {renderScore(
                      m.score,
                      m.player1_name,
                      m.player2_name,
                    )}
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