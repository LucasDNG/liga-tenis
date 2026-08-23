import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";

import "./ChallengesPage.css";

const statusLabels = {
  pending: "Pendiente",
  accepted: "Partido confirmado",
  completed: "Finalizado",
  rejected: "Rechazado",
};

const formatDateTime = (value) => {
  if (!value) return "";

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(new Date(value));
};

const toDateTimeLocal = (value) => {
  if (!value) return "";

  const date =
    new Date(value);

  const formatter =
    new Intl.DateTimeFormat(
      "sv-SE",
      {
        timeZone:
          "America/Argentina/Buenos_Aires",

        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      },
    );

  const parts =
    formatter.formatToParts(
      date,
    );

  const get = (type) =>
    parts.find(
      (part) =>
        part.type === type,
    )?.value;

  return `${get("year")}-${get(
    "month",
  )}-${get("day")}T${get(
    "hour",
  )}:${get("minute")}`;
};

const normalizeWhatsapp = (
  phone,
) => {
  if (!phone) return null;

  let number =
    String(phone).replace(
      /\D/g,
      "",
    );

  if (
    number.startsWith("00")
  ) {
    number =
      number.slice(2);
  }

  if (
    number.startsWith("0")
  ) {
    number =
      number.slice(1);
  }

  /*
    Si ya viene con código
    argentino, lo usamos.

    Si no, agregamos:
    54 + 9 + número.
  */
  if (
    number.startsWith("549")
  ) {
    return number;
  }

  if (
    number.startsWith("54")
  ) {
    return `549${number.slice(
      2,
    )}`;
  }

  return `549${number}`;
};

const whatsappLink = (
  phone,
  rivalName,
) => {
  const number =
    normalizeWhatsapp(phone);

  if (!number) return "#";

  const message =
    encodeURIComponent(
      `Hola ${rivalName}, te escribo por el desafío de la Liga de Tenis San Pedro para coordinar el partido.`,
    );

  return `https://wa.me/${number}?text=${message}`;
};

function ActionWithTooltip({
  disabled,
  tooltip,
  children,
}) {
  return (
    <span
      className={
        disabled
          ? "tooltip-wrap disabled"
          : "tooltip-wrap"
      }
    >
      {children}

      {disabled &&
        tooltip && (
          <span className="challenge-tooltip">
            {tooltip}
          </span>
        )}
    </span>
  );
}

export default function ChallengesPage() {
  const { user } =
    useAuth();

  const [
    challenges,
    setChallenges,
  ] = useState([]);

  const [
    rotation,
    setRotation,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(null);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    forms,
    setForms,
  ] = useState({});

  const loadChallenges =
    async () => {
      try {
        setLoading(true);

        const { data } =
          await api.get(
            "/challenges",
          );

        setChallenges(
          data.challenges || [],
        );

        setRotation(
          data.rotation || null,
        );

        /*
          Precargamos en el formulario
          los turnos que ya existan.
        */
        setForms(
          (previous) => {
            const next = {
              ...previous,
            };

            for (const challenge of data.challenges ||
              []) {
              if (
                !next[
                  challenge.id
                ]
              ) {
                next[
                  challenge.id
                ] = {
                  venue:
                    challenge.venue ||
                    "",

                  scheduled_at:
                    toDateTimeLocal(
                      challenge.scheduled_at,
                    ),
                };
              }
            }

            return next;
          },
        );
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudieron cargar los desafíos.",
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadChallenges();
  }, []);

  const received =
    useMemo(
      () =>
        challenges.filter(
          (challenge) =>
            challenge.challenged_id ===
            user?.id,
        ),
      [
        challenges,
        user?.id,
      ],
    );

  const sent =
    useMemo(
      () =>
        challenges.filter(
          (challenge) =>
            challenge.challenger_id ===
            user?.id,
        ),
      [
        challenges,
        user?.id,
      ],
    );

  const changeForm = (
    id,
    field,
    value,
  ) => {
    setForms(
      (previous) => ({
        ...previous,

        [id]: {
          ...(previous[id] ||
            {}),

          [field]:
            value,
        },
      }),
    );
  };

  const saveSchedule =
    async (challenge) => {
      const form =
        forms[challenge.id] ||
        {};

      if (
        !form.venue?.trim()
      ) {
        setMessage(
          "Ingresá el lugar donde van a jugar.",
        );

        return;
      }

      if (
        !form.scheduled_at
      ) {
        setMessage(
          "Ingresá la fecha y la hora del partido.",
        );

        return;
      }

      try {
        setMessage("");

        setActionLoading(
          `schedule-${challenge.id}`,
        );

        const localDate =
          new Date(
            form.scheduled_at,
          );

        const { data } =
          await api.patch(
            `/challenges/${challenge.id}/schedule`,
            {
              venue:
                form.venue.trim(),

              scheduled_at:
                localDate.toISOString(),
            },
          );

        setMessage(
          data.message,
        );

        await loadChallenges();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo guardar el turno.",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };

  const acceptChallenge =
    async (challenge) => {
      try {
        setMessage("");

        setActionLoading(
          `accept-${challenge.id}`,
        );

        const { data } =
          await api.patch(
            `/challenges/${challenge.id}/accept`,
          );

        setMessage(
          data.message,
        );

        await loadChallenges();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo aceptar el desafío.",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };

  const rejectChallenge =
    async (challenge) => {
      const confirmed =
        window.confirm(
          "Rechazar este desafío te descontará 8 puntos Elo. ¿Querés continuar?",
        );

      if (!confirmed) {
        return;
      }

      try {
        setMessage("");

        setActionLoading(
          `reject-${challenge.id}`,
        );

        const { data } =
          await api.patch(
            `/challenges/${challenge.id}/reject`,
          );

        setMessage(
          data.message,
        );

        await loadChallenges();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo rechazar el desafío.",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };

  const renderChallenge = (
    challenge,
  ) => {
    const incoming =
      challenge.challenged_id ===
      user?.id;

    const rivalName =
      incoming
        ? challenge.challenger_name
        : challenge.challenged_name;

    const rivalPhone =
      incoming
        ? challenge.challenger_phone
        : challenge.challenged_phone;

    const hasSchedule =
      Boolean(
        challenge.venue &&
          challenge.scheduled_at,
      );

    const pending =
      challenge.status ===
      "pending";

    const canAccept =
      incoming &&
      pending &&
      challenge.can_accept;

    const canReject =
      incoming &&
      pending &&
      challenge.can_reject;

    let acceptTooltip =
      challenge.rotation_block_message;

    if (
      canAccept &&
      !hasSchedule
    ) {
      acceptTooltip =
        "Antes de aceptar tienen que cargar el lugar, la fecha y la hora del partido.";
    }

    const acceptDisabled =
      !canAccept ||
      !hasSchedule ||
      Boolean(
        actionLoading,
      );

    const rejectDisabled =
      !canReject ||
      Boolean(
        actionLoading,
      );

    const scheduleLoading =
      actionLoading ===
      `schedule-${challenge.id}`;

    const accepting =
      actionLoading ===
      `accept-${challenge.id}`;

    const rejecting =
      actionLoading ===
      `reject-${challenge.id}`;

    return (
      <article
        className="challenge-card"
        key={challenge.id}
      >
        <div className="challenge-card-top">
          <div>
            <span className="challenge-kicker">
              {incoming
                ? "DESAFÍO RECIBIDO"
                : "DESAFÍO ENVIADO"}
            </span>

            <h2>
              {rivalName}
            </h2>
          </div>

          <span
            className={`challenge-status ${challenge.status}`}
          >
            {statusLabels[
              challenge.status
            ] ||
              challenge.status}
          </span>
        </div>

        <div className="challenge-info-grid">
          <div>
            <small>
              Enfrentamientos anteriores
            </small>

            <strong>
              {
                challenge.historical_meetings_at_creation
              }
            </strong>
          </div>

          {incoming &&
            pending && (
              <div>
                <small>
                  Estado en tu rueda
                </small>

                <strong>
                  {challenge.can_accept
                    ? "Es tu turno"
                    : "En espera"}
                </strong>
              </div>
            )}
        </div>

        {challenge.rotation_block_message &&
          incoming &&
          pending && (
            <div className="rotation-notice">
              <strong>
                Rueda de rivales
              </strong>

              <p>
                {
                  challenge.rotation_block_message
                }
              </p>
            </div>
          )}

        {pending && (
          <>
            <section className="challenge-step">
              <div className="step-number">
                1
              </div>

              <div>
                <h3>
                  Coordinen por WhatsApp
                </h3>

                <p>
                  Primero hablen entre
                  ustedes y reserven
                  una cancha.
                </p>
              </div>
            </section>

            <div className="contact-box">
              <div>
                <small>
                  Rival
                </small>

                <strong>
                  {rivalName}
                </strong>

                <span>
                  {rivalPhone}
                </span>
              </div>

              <a
                href={whatsappLink(
                  rivalPhone,
                  rivalName,
                )}
                target="_blank"
                rel="noreferrer"
                className="whatsapp-button"
              >
                Abrir WhatsApp
              </a>
            </div>

            <section className="challenge-step">
              <div className="step-number">
                2
              </div>

              <div>
                <h3>
                  Carguen el turno
                </h3>

                <p>
                  Cualquiera de los
                  dos puede cargar o
                  actualizar el lugar,
                  la fecha y la hora.
                </p>
              </div>
            </section>

            {hasSchedule && (
              <div className="scheduled-summary">
                <span>
                  TURNO REGISTRADO
                </span>

                <strong>
                  {challenge.venue}
                </strong>

                <p>
                  {formatDateTime(
                    challenge.scheduled_at,
                  )}
                </p>

                {challenge.schedule_updated_by_name && (
                  <small>
                    Última modificación:
                    {" "}
                    {
                      challenge.schedule_updated_by_name
                    }
                  </small>
                )}
              </div>
            )}

            <div className="schedule-grid">
              <label>
                <span>
                  Lugar / cancha
                </span>

                <input
                  type="text"
                  placeholder="Ej: Club Náutico San Pedro"
                  value={
                    forms[
                      challenge.id
                    ]?.venue || ""
                  }
                  onChange={(
                    event,
                  ) =>
                    changeForm(
                      challenge.id,
                      "venue",
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <label>
                <span>
                  Fecha y hora
                </span>

                <input
                  type="datetime-local"
                  value={
                    forms[
                      challenge.id
                    ]
                      ?.scheduled_at ||
                    ""
                  }
                  onChange={(
                    event,
                  ) =>
                    changeForm(
                      challenge.id,
                      "scheduled_at",
                      event.target
                        .value,
                    )
                  }
                />
              </label>

              <button
                className="challenge-action"
                onClick={() =>
                  saveSchedule(
                    challenge,
                  )
                }
                disabled={
                  Boolean(
                    actionLoading,
                  )
                }
              >
                {scheduleLoading
                  ? "GUARDANDO..."
                  : hasSchedule
                    ? "Actualizar turno"
                    : "Guardar turno"}
              </button>
            </div>

            {incoming && (
              <>
                <section className="challenge-step">
                  <div className="step-number">
                    3
                  </div>

                  <div>
                    <h3>
                      Resolver desafío
                    </h3>

                    <p>
                      Aceptarlo confirma
                      el partido.
                      Rechazarlo descuenta
                      8 puntos Elo.
                    </p>
                  </div>
                </section>

                <div className="challenge-buttons">
                  <ActionWithTooltip
                    disabled={
                      acceptDisabled
                    }
                    tooltip={
                      acceptTooltip ||
                      "Esta acción todavía no está disponible."
                    }
                  >
                    <button
                      className="challenge-action primary"
                      disabled={
                        acceptDisabled
                      }
                      onClick={() =>
                        acceptChallenge(
                          challenge,
                        )
                      }
                    >
                      {accepting
                        ? "ACEPTANDO..."
                        : "Aceptar desafío"}
                    </button>
                  </ActionWithTooltip>

                  <ActionWithTooltip
                    disabled={
                      rejectDisabled
                    }
                    tooltip={
                      challenge.rotation_block_message ||
                      "Todavía no corresponde resolver este desafío en tu rueda."
                    }
                  >
                    <button
                      className="challenge-action danger"
                      disabled={
                        rejectDisabled
                      }
                      onClick={() =>
                        rejectChallenge(
                          challenge,
                        )
                      }
                    >
                      {rejecting
                        ? "RECHAZANDO..."
                        : "Rechazar (-8 Elo)"}
                    </button>
                  </ActionWithTooltip>
                </div>
              </>
            )}

            {!incoming && (
              <div className="waiting-note">
                Tu rival podrá aceptar
                cuando este desafío
                corresponda en su rueda
                y exista un turno
                cargado.
              </div>
            )}
          </>
        )}

        {challenge.status ===
          "accepted" && (
          <div className="confirmed-match">
            <span>
              PARTIDO CONFIRMADO
            </span>

            <strong>
              {challenge.venue}
            </strong>

            <p>
              {formatDateTime(
                challenge.scheduled_at,
              )}
            </p>

            <small>
              Este partido ya forma
              parte de los próximos
              encuentros de la Liga.
            </small>
          </div>
        )}

        {challenge.status ===
          "completed" && (
          <div className="completed-challenge">
            Partido finalizado.
            Este turno de la rueda
            ya fue cumplido.
          </div>
        )}

        {challenge.status ===
          "rejected" && (
          <div className="rejected-challenge">
            <strong>
              Desafío rechazado
            </strong>

            <p>
              Penalización:
              {" "}
              -
              {
                challenge.rejection_elo_penalty
              }
              {" "}
              Elo
            </p>

            {challenge.rejected_at && (
              <small>
                {formatDateTime(
                  challenge.rejected_at,
                )}
              </small>
            )}
          </div>
        )}
      </article>
    );
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading">
          <div>
            <span>
              COMPETENCIA
            </span>

            <h1>
              Desafíos
            </h1>
          </div>
        </div>

        {rotation && (
          <div className="rotation-summary">
            <span>
              TU RUEDA
            </span>

            {rotation.blocked_by_active_match ? (
              <p>
                Tenés un partido
                confirmado pendiente
                contra{" "}
                <strong>
                  {
                    rotation.current_opponent
                  }
                </strong>
                . Primero debe
                finalizar ese partido.
              </p>
            ) : rotation.current_opponent ? (
              <p>
                El próximo desafío
                que podés resolver es
                contra{" "}
                <strong>
                  {
                    rotation.current_opponent
                  }
                </strong>
                .
              </p>
            ) : (
              <p>
                No tenés desafíos
                pendientes en tu rueda.
              </p>
            )}
          </div>
        )}

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        {loading ? (
          <div className="notice">
            Cargando desafíos...
          </div>
        ) : (
          <div className="challenge-sections">
            <section>
              <div className="challenge-section-heading">
                <span>
                  RECIBIDOS
                </span>

                <h2>
                  Desafíos recibidos
                </h2>

                <p>
                  El sistema indica
                  automáticamente cuál
                  corresponde resolver
                  según tu rueda de
                  rivales.
                </p>
              </div>

              <div className="challenge-list">
                {received.length ? (
                  received.map(
                    renderChallenge,
                  )
                ) : (
                  <div className="challenge-empty">
                    No tenés desafíos
                    recibidos.
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="challenge-section-heading">
                <span>
                  ENVIADOS
                </span>

                <h2>
                  Desafíos enviados
                </h2>

                <p>
                  Acá podés seguir la
                  coordinación y ver si
                  el partido ya fue
                  programado.
                </p>
              </div>

              <div className="challenge-list">
                {sent.length ? (
                  sent.map(
                    renderChallenge,
                  )
                ) : (
                  <div className="challenge-empty">
                    Todavía no enviaste
                    desafíos.
                  </div>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}