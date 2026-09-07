import {
  useEffect,
  useState,
} from "react";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";

import "./MatchesPage.css";


const emptyScore = () => [
  {
    p1: "",
    p2: "",
  },
  {
    p1: "",
    p2: "",
  },
];


const statusLabels = {
  pending:
    "Programado",

  awaiting_confirmation:
    "Esperando confirmación",

  completed:
    "Finalizado",
};


const formatDateTime = (
  value,
) => {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat(
    "es-AR",
    {
      dateStyle:
        "full",

      timeStyle:
        "short",

      timeZone:
        "America/Argentina/Buenos_Aires",
    },
  ).format(
    new Date(value),
  );
};


const formatPhone = (
  phone,
) => {
  if (!phone) {
    return "";
  }

  let numbers =
    String(phone).replace(
      /\D/g,
      "",
    );

  if (
    numbers.startsWith(
      "0",
    )
  ) {
    numbers =
      numbers.slice(1);
  }

  if (
    numbers.length === 10
  ) {
    const area =
      numbers.slice(
        0,
        4,
      );

    const local =
      numbers.slice(4);

    return `(${area}) ${local}`;
  }

  return numbers;
};


const normalizeWhatsapp = (
  phone,
) => {
  if (!phone) {
    return "";
  }

  let number =
    String(phone).replace(
      /\D/g,
      "",
    );

  if (
    number.startsWith(
      "00",
    )
  ) {
    number =
      number.slice(2);
  }

  if (
    number.startsWith(
      "0",
    )
  ) {
    number =
      number.slice(1);
  }

  if (
    number.startsWith(
      "549",
    )
  ) {
    return number;
  }

  if (
    number.startsWith(
      "54",
    )
  ) {
    return `549${number.slice(
      2,
    )}`;
  }

  return `549${number}`;
};


const setWinner = (
  set,
) => {
  if (
    set.p1 === "" ||
    set.p2 === ""
  ) {
    return null;
  }

  const p1 =
    Number(set.p1);

  const p2 =
    Number(set.p2);

  if (
    !Number.isInteger(p1) ||
    !Number.isInteger(p2)
  ) {
    return null;
  }

  if (p1 > p2) {
    return 1;
  }

  if (p2 > p1) {
    return 2;
  }

  return null;
};


const normalizeScoreSets = (
  score,
) => {
  const firstTwo =
    score.slice(
      0,
      2,
    );

  if (
    firstTwo.length < 2
  ) {
    return firstTwo;
  }

  const winner1 =
    setWinner(
      firstTwo[0],
    );

  const winner2 =
    setWinner(
      firstTwo[1],
    );

  const firstTwoComplete =
    winner1 !== null &&
    winner2 !== null;

  const needsThird =
    firstTwoComplete &&
    winner1 !== winner2;

  if (needsThird) {
    if (score[2]) {
      return [
        ...firstTwo,
        score[2],
      ];
    }

    return [
      ...firstTwo,
      {
        p1: "",
        p2: "",
      },
    ];
  }

  return firstTwo;
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
          ? "match-tooltip-wrap disabled"
          : "match-tooltip-wrap"
      }
      tabIndex={
        disabled
          ? 0
          : undefined
      }
    >
      {children}

      {disabled &&
        tooltip && (
          <span className="match-tooltip">
            {tooltip}
          </span>
        )}
    </span>
  );
}


export default function MatchesPage() {
  const { user } =
    useAuth();

  const [
    matches,
    setMatches,
  ] = useState([]);

  const [
    scores,
    setScores,
  ] = useState({});

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(null);


  const load =
    async () => {
      try {
        setLoading(true);

        const { data } =
          await api.get(
            "/matches",
          );

        setMatches(
          data.matches || [],
        );
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudieron cargar los partidos",
        );
      } finally {
        setLoading(false);
      }
    };


  useEffect(() => {
    load();
  }, []);


  const change = (
    id,
    setIndex,
    side,
    value,
  ) => {
    /*
      Permitimos solamente:
      vacío o entero entre 0 y 7.

      La validación definitiva
      sigue estando en backend.
    */
    if (
      value !== ""
    ) {
      const number =
        Number(value);

      if (
        !Number.isInteger(
          number,
        ) ||
        number < 0 ||
        number > 7
      ) {
        return;
      }
    }

    setScores(
      (previous) => {
        const current =
          previous[id]
            ? previous[id].map(
                (set) => ({
                  ...set,
                }),
              )
            : emptyScore();

        while (
          current.length <=
          setIndex
        ) {
          current.push({
            p1: "",
            p2: "",
          });
        }

        current[
          setIndex
        ][side] =
          value;

        const normalized =
          normalizeScoreSets(
            current,
          );

        return {
          ...previous,

          [id]:
            normalized,
        };
      },
    );
  };


  const submit =
    async (
      id,
    ) => {
      if (
        actionLoading
      ) {
        return;
      }

      const rawScore =
        scores[id] ||
        emptyScore();

      const normalized =
        normalizeScoreSets(
          rawScore,
        );

      const hasEmpty =
        normalized.some(
          (set) =>
            set.p1 === "" ||
            set.p2 === "",
        );

      if (hasEmpty) {
        setMessage(
          "Completá todos los sets antes de enviar el resultado.",
        );

        return;
      }

      const score =
        normalized.map(
          (set) => ({
            p1:
              Number(
                set.p1,
              ),

            p2:
              Number(
                set.p2,
              ),
          }),
        );

      try {
        setMessage("");

        setActionLoading(
          `${id}-submit`,
        );

        const { data } =
          await api.patch(
            `/matches/${id}/result`,
            {
              score,
            },
          );

        setMessage(
          data.message,
        );

        setScores(
          (previous) => {
            const next = {
              ...previous,
            };

            delete next[id];

            return next;
          },
        );

        await load();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo enviar el resultado",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };


  const confirm =
    async (
      id,
    ) => {
      if (
        actionLoading
      ) {
        return;
      }

      try {
        setMessage("");

        setActionLoading(
          `${id}-confirm`,
        );

        const { data } =
          await api.patch(
            `/matches/${id}/confirm`,
          );

        setMessage(
          data.message,
        );

        await load();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo confirmar el resultado",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };


  const reject =
    async (
      id,
    ) => {
      if (
        actionLoading
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "¿El resultado cargado es incorrecto? El partido volverá a quedar disponible para cargar un nuevo resultado.",
        );

      if (!confirmed) {
        return;
      }

      try {
        setMessage("");

        setActionLoading(
          `${id}-reject`,
        );

        const { data } =
          await api.patch(
            `/matches/${id}/reject-result`,
          );

        setMessage(
          data.message,
        );

        await load();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo rechazar el resultado",
        );
      } finally {
        setActionLoading(
          null,
        );
      }
    };


  const renderScore = (
    matchScore,
    player1Name,
    player2Name,
  ) => {
    if (
      !Array.isArray(
        matchScore,
      )
    ) {
      return null;
    }

    return (
      <div className="match-score-view">
        {matchScore.map(
          (
            set,
            index,
          ) => (
            <div
              className="match-set-view"
              key={index}
            >
              <strong>
                Set {index + 1}
              </strong>

              <div>
                <span>
                  {player1Name}
                </span>

                <b>
                  {set.p1}
                </b>

                <span>
                  {player2Name}
                </span>

                <b>
                  {set.p2}
                </b>
              </div>
            </div>
          ),
        )}
      </div>
    );
  };


  return (
    <main className="page-dark">
      <div className="site-width page-content">

        <div className="page-heading">
          <div>
            <span>
              PARTIDOS
            </span>

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


        {loading ? (
          <div className="notice">
            Cargando partidos...
          </div>
        ) : (
          <div className="match-list">

            {matches.length ===
              0 && (
              <div className="match-empty">
                Todavía no tenés
                partidos.
              </div>
            )}


            {matches.map(
              (match) => {
                const submittedByMe =
                  Number(
                    match.result_submitted_by,
                  ) ===
                  Number(
                    user?.id,
                  );

                const score =
                  scores[
                    match.id
                  ] ||
                  emptyScore();

                const rivalName =
                  Number(
                    match.player1_id,
                  ) ===
                  Number(
                    user?.id,
                  )
                    ? match.player2_name
                    : match.player1_name;

                const rivalPhone =
                  Number(
                    match.player1_id,
                  ) ===
                  Number(
                    user?.id,
                  )
                    ? match.player2_phone
                    : match.player1_phone;

                const whatsappNumber =
                  normalizeWhatsapp(
                    rivalPhone,
                  );

                const statusLabel =
                  statusLabels[
                    match.status
                  ] ||
                  match.status;

                const scheduledTime =
                  match.scheduled_at
                    ? new Date(
                        match.scheduled_at,
                      ).getTime()
                    : null;

                const validScheduledTime =
                  Number.isFinite(
                    scheduledTime,
                  );

                const matchStarted =
                  validScheduledTime &&
                  scheduledTime <=
                    Date.now();

                const resultBlocked =
                  match.status ===
                    "pending" &&
                  !matchStarted;

                const submitting =
                  actionLoading ===
                  `${match.id}-submit`;

                const confirming =
                  actionLoading ===
                  `${match.id}-confirm`;

                const rejecting =
                  actionLoading ===
                  `${match.id}-reject`;

                const resultTooltip =
                  !validScheduledTime
                    ? "Este partido todavía no tiene un horario registrado."
                    : `El resultado se habilita el ${formatDateTime(
                        match.scheduled_at,
                      )}.`;

                return (
                  <article
                    className="match-card"
                    key={
                      match.id
                    }
                  >

                    <div className="match-card-head">
                      <div>
                        <span className="match-kicker">
                          PARTIDO
                        </span>

                        <h2>
                          {
                            match.player1_name
                          }

                          <i>
                            vs
                          </i>

                          {
                            match.player2_name
                          }
                        </h2>
                      </div>

                      <span
                        className={`match-status ${match.status}`}
                      >
                        {
                          statusLabel
                        }
                      </span>
                    </div>


                    {match.venue &&
                      match.scheduled_at && (
                        <div className="match-schedule">
                          <span>
                            {match.status ===
                            "completed"
                              ? "PARTIDO JUGADO"
                              : matchStarted
                                ? "PARTIDO EN CURSO / PENDIENTE"
                                : "PRÓXIMO PARTIDO"}
                          </span>

                          <strong>
                            {
                              match.venue
                            }
                          </strong>

                          <p>
                            {formatDateTime(
                              match.scheduled_at,
                            )}
                          </p>
                        </div>
                      )}


                    {rivalPhone &&
                      whatsappNumber && (
                        <div className="match-contact">
                          <div>
                            <small>
                              Rival
                            </small>

                            <strong>
                              {
                                rivalName
                              }
                            </strong>

                            <span>
                              {formatPhone(
                                rivalPhone,
                              )}
                            </span>
                          </div>

                          <a
                            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
                              `Hola ${rivalName}, te escribo por nuestro partido de la Liga de Tenis San Pedro.`,
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            WhatsApp
                          </a>
                        </div>
                      )}


                    {match.status ===
                      "pending" &&
                      resultBlocked && (
                        <div className="match-waiting">
                          <strong>
                            Resultado todavía bloqueado
                          </strong>

                          <p>
                            {
                              resultTooltip
                            }
                          </p>
                        </div>
                      )}


                    {match.status ===
                      "pending" && (
                        <div className="match-score-editor">

                          <div className="score-row score-title">
                            <span>
                              Set
                            </span>

                            <span>
                              {
                                match.player1_name
                              }
                            </span>

                            <span>
                              {
                                match.player2_name
                              }
                            </span>
                          </div>


                          {score.map(
                            (
                              set,
                              index,
                            ) => (
                              <div
                                className="score-row"
                                key={
                                  index
                                }
                              >
                                <span>
                                  Set{" "}
                                  {index +
                                    1}
                                </span>

                                <input
                                  type="number"
                                  min="0"
                                  max="7"
                                  step="1"
                                  inputMode="numeric"
                                  value={
                                    set.p1
                                  }
                                  disabled={
                                    resultBlocked ||
                                    Boolean(
                                      actionLoading,
                                    )
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    change(
                                      match.id,
                                      index,
                                      "p1",
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                />

                                <input
                                  type="number"
                                  min="0"
                                  max="7"
                                  step="1"
                                  inputMode="numeric"
                                  value={
                                    set.p2
                                  }
                                  disabled={
                                    resultBlocked ||
                                    Boolean(
                                      actionLoading,
                                    )
                                  }
                                  onChange={(
                                    event,
                                  ) =>
                                    change(
                                      match.id,
                                      index,
                                      "p2",
                                      event
                                        .target
                                        .value,
                                    )
                                  }
                                />
                              </div>
                            ),
                          )}


                          {score.length ===
                            3 && (
                            <div className="match-waiting">
                              Los primeros dos sets
                              están 1–1. Se habilitó
                              automáticamente el tercer set.
                            </div>
                          )}


                          <ActionWithTooltip
                            disabled={
                              resultBlocked ||
                              Boolean(
                                actionLoading,
                              )
                            }
                            tooltip={
                              resultBlocked
                                ? resultTooltip
                                : actionLoading
                                  ? "Hay otra acción en curso."
                                  : null
                            }
                          >
                            <button
                              className="match-action primary"
                              disabled={
                                resultBlocked ||
                                Boolean(
                                  actionLoading,
                                )
                              }
                              onClick={() =>
                                submit(
                                  match.id,
                                )
                              }
                            >
                              {submitting
                                ? "ENVIANDO..."
                                : "Enviar resultado"}
                            </button>
                          </ActionWithTooltip>

                        </div>
                      )}


                    {match.status ===
                      "awaiting_confirmation" && (
                        <div className="match-proposed">
                          <span className="match-kicker">
                            RESULTADO PROPUESTO
                          </span>

                          {renderScore(
                            match.proposed_score,
                            match.player1_name,
                            match.player2_name,
                          )}

                          {submittedByMe ? (
                            <div className="match-waiting">
                              <strong>
                                Esperando confirmación
                              </strong>

                              <p>
                                El resultado ya fue enviado.
                                Tu rival debe confirmarlo
                                o rechazarlo.
                              </p>
                            </div>
                          ) : (
                            <div className="match-buttons">

                              <button
                                className="match-action primary"
                                disabled={
                                  Boolean(
                                    actionLoading,
                                  )
                                }
                                onClick={() =>
                                  confirm(
                                    match.id,
                                  )
                                }
                              >
                                {confirming
                                  ? "CONFIRMANDO..."
                                  : "Confirmar resultado"}
                              </button>

                              <button
                                className="match-action danger"
                                disabled={
                                  Boolean(
                                    actionLoading,
                                  )
                                }
                                onClick={() =>
                                  reject(
                                    match.id,
                                  )
                                }
                              >
                                {rejecting
                                  ? "RECHAZANDO..."
                                  : "El resultado es incorrecto"}
                              </button>

                            </div>
                          )}
                        </div>
                      )}


                    {match.status ===
                      "completed" && (
                        <div className="match-completed">
                          <span className="match-kicker">
                            RESULTADO FINAL
                          </span>

                          <h3>
                            Ganador:{" "}
                            <strong>
                              {
                                match.winner_name
                              }
                            </strong>
                          </h3>

                          {renderScore(
                            match.score,
                            match.player1_name,
                            match.player2_name,
                          )}

                          {match.completed_at && (
                            <small>
                              Confirmado{" "}
                              {formatDateTime(
                                match.completed_at,
                              )}
                            </small>
                          )}
                        </div>
                      )}

                  </article>
                );
              },
            )}

          </div>
        )}

      </div>
    </main>
  );
}