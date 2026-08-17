import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

const statusLabels = {
  pending: "Pendiente",
  accepted: "Aceptado",
  rejected: "Rechazado",
};

const formatPhone = (phone) => {
  if (!phone) return "";

  let numbers = phone.replace(/\D/g, "");

  // Quita el 0 de la característica
  if (numbers.startsWith("0")) {
    numbers = numbers.slice(1);
  }

  // Ejemplo:
  // 3329400704 -> (3329) 400704
  if (numbers.length === 10) {
    const areaCode = numbers.slice(0, 4);
    const localNumber = numbers.slice(4);

    return `(${areaCode}) ${localNumber}`;
  }

  // Si por algún motivo el número tiene otro formato,
  // lo mostramos sin modificar para no romperlo.
  return numbers;
};

export default function ChallengesPage() {
  const { user } = useAuth();

  const [challenges, setChallenges] = useState([]);
  const [message, setMessage] = useState("");

  const load = () =>
    api
      .get("/challenges")
      .then(({ data }) => setChallenges(data.challenges));

  useEffect(() => {
    load();
  }, []);

  const action = async (id, type) => {
    try {
      const { data } = await api.patch(
        `/challenges/${id}/${type}`,
      );

      setMessage(data.message);

      load();
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo actualizar el desafío",
      );
    }
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading">
          <div>
            <span>TU LIGA</span>
            <h1>Desafíos</h1>
          </div>
        </div>

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        <div className="cards-dark">
          {challenges.length === 0 && (
            <div className="empty-dark">
              No tenés desafíos todavía.
            </div>
          )}

          {challenges.map((challenge) => {
            const incoming =
              challenge.challenged_id === user?.id;

            const rivalName = incoming
              ? challenge.challenger_name
              : challenge.challenged_name;

            const rivalPhone = incoming
              ? challenge.challenger_phone
              : challenge.challenged_phone;

            const statusLabel =
              statusLabels[challenge.status] ||
              challenge.status;

            const cleanPhone =
              rivalPhone?.replace(/\D/g, "");

            const formattedPhone =
              formatPhone(rivalPhone);

            return (
              <article
                key={challenge.id}
                className="card-dark"
              >
                <div>
                  <span className="card-label">
                    {incoming
                      ? "TE DESAFIÓ"
                      : "DESAFIASTE A"}
                  </span>

                  <h2>{rivalName}</h2>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "18px",
                    marginTop: "18px",
                  }}
                >
                  <span
                    className={`status-dark ${challenge.status}`}
                  >
                    {statusLabel}
                  </span>

                  {challenge.status === "accepted" &&
                    rivalPhone && (
                      <>
                        <a
                          className="whatsapp"
                          style={{
                            marginTop: 0,
                          }}
                          href={`https://wa.me/54${cleanPhone}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          WhatsApp del rival
                        </a>

                        <span
                          style={{
                            color: "#c0c7c0",
                            fontSize: "13px",
                            letterSpacing: "0.03em",
                          }}
                        >
                          {formattedPhone}
                        </span>
                      </>
                    )}
                </div>

                {incoming &&
                  challenge.status === "pending" && (
                    <div className="card-actions">
                      <button
                        onClick={() =>
                          action(
                            challenge.id,
                            "accept",
                          )
                        }
                        className="small-action"
                      >
                        Aceptar
                      </button>

                      <button
                        onClick={() =>
                          action(
                            challenge.id,
                            "reject",
                          )
                        }
                        className="small-action secondary"
                      >
                        Rechazar
                      </button>
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