import {
  useEffect,
  useState,
} from "react";

import { api } from "../api";

import "./AdminPage.css";

const formatDateTime = (value) => {
  if (!value) return "-";

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

const formatScore = (score) => {
  if (!Array.isArray(score)) {
    return "-";
  }

  return score
    .map(
      (set) =>
        `${set.p1}-${set.p2}`,
    )
    .join(" · ");
};

const formatDni = (dni) => {
  if (!dni) return "-";

  return String(dni).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    ".",
  );
};

const flagLabels = {
  result_too_fast:
    "Resultado cargado demasiado rápido",

  frequent_opponents:
    "Rivales demasiado frecuentes",

  elo_concentration:
    "Concentración sospechosa de Elo",

  repeated_result_rejection:
    "Resultado rechazado varias veces",
};

export default function AdminPage() {
  const [
    activeTab,
    setActiveTab,
  ] = useState("users");

  const [
    users,
    setUsers,
  ] = useState([]);

  const [
    selectedUser,
    setSelectedUser,
  ] = useState(null);

  const [
    auditMatches,
    setAuditMatches,
  ] = useState([]);

  const [
    selectedAudit,
    setSelectedAudit,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    loadingUser,
    setLoadingUser,
  ] = useState(false);

  const [
    loadingAudit,
    setLoadingAudit,
  ] = useState(false);

  const [
    actionLoading,
    setActionLoading,
  ] = useState(false);

  const [
    message,
    setMessage,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState("");

  const loadPendingUsers =
    async () => {
      try {
        setLoading(true);
        setError("");

        const { data } =
          await api.get(
            "/admin/users/pending",
          );

        setUsers(
          data.users || [],
        );
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudieron cargar los jugadores pendientes",
        );
      } finally {
        setLoading(false);
      }
    };

  const loadAuditMatches =
    async () => {
      try {
        setLoading(true);
        setError("");

        const { data } =
          await api.get(
            "/admin/audit/matches",
          );

        setAuditMatches(
          data.matches || [],
        );
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudieron cargar los partidos en auditoría",
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    if (
      activeTab === "users"
    ) {
      loadPendingUsers();
    }

    if (
      activeTab === "audit"
    ) {
      loadAuditMatches();
    }
  }, [activeTab]);

  const switchTab = (
    tab,
  ) => {
    setActiveTab(tab);

    setSelectedUser(
      null,
    );

    setSelectedAudit(
      null,
    );

    setMessage("");
    setError("");
  };

  const openUser =
    async (id) => {
      try {
        setLoadingUser(
          true,
        );

        setError("");
        setMessage("");

        const { data } =
          await api.get(
            `/admin/users/${id}`,
          );

        setSelectedUser(
          data.user,
        );
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo cargar el jugador",
        );
      } finally {
        setLoadingUser(
          false,
        );
      }
    };

  const approveUser =
    async () => {
      if (!selectedUser) {
        return;
      }

      const confirmed =
        window.confirm(
          `¿Aprobar a ${selectedUser.name}?`,
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          true,
        );

        setError("");

        const { data } =
          await api.patch(
            `/admin/users/${selectedUser.id}/approve`,
          );

        setMessage(
          data.message,
        );

        setSelectedUser(
          null,
        );

        await loadPendingUsers();
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo aprobar el jugador",
        );
      } finally {
        setActionLoading(
          false,
        );
      }
    };

  const rejectUser =
    async () => {
      if (!selectedUser) {
        return;
      }

      const confirmed =
        window.confirm(
          `¿Rechazar la verificación de ${selectedUser.name}?`,
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          true,
        );

        setError("");

        const { data } =
          await api.patch(
            `/admin/users/${selectedUser.id}/reject`,
          );

        setMessage(
          data.message,
        );

        setSelectedUser(
          null,
        );

        await loadPendingUsers();
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo rechazar el jugador",
        );
      } finally {
        setActionLoading(
          false,
        );
      }
    };

  const openAuditMatch =
    async (id) => {
      try {
        setLoadingAudit(
          true,
        );

        setError("");
        setMessage("");

        const { data } =
          await api.get(
            `/admin/audit/matches/${id}`,
          );

        setSelectedAudit(
          data,
        );
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo cargar la auditoría del partido",
        );
      } finally {
        setLoadingAudit(
          false,
        );
      }
    };

  const resolveFlag =
    async (flagId) => {
      try {
        setActionLoading(
          true,
        );

        setError("");

        const { data } =
          await api.patch(
            `/admin/audit/flags/${flagId}/resolve`,
          );

        setMessage(
          data.message,
        );

        if (
          selectedAudit
        ) {
          await openAuditMatch(
            selectedAudit
              .match.id,
          );
        }

        await loadAuditMatches();
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo resolver la alerta",
        );
      } finally {
        setActionLoading(
          false,
        );
      }
    };

  const annulMatch =
    async () => {
      if (
        !selectedAudit
      ) {
        return;
      }

      const reason =
        window.prompt(
          "Indicá el motivo de la anulación:",
        );

      if (
        !reason ||
        reason.trim()
          .length < 5
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          "Esto anulará el partido y revertirá todos los puntos Elo generados. ¿Continuar?",
        );

      if (!confirmed) {
        return;
      }

      try {
        setActionLoading(
          true,
        );

        setError("");

        const { data } =
          await api.patch(
            `/admin/audit/matches/${selectedAudit.match.id}/annul`,
            {
              reason:
                reason.trim(),
            },
          );

        setMessage(
          data.message,
        );

        setSelectedAudit(
          null,
        );

        await loadAuditMatches();
      } catch (err) {
        setError(
          err.response?.data
            ?.message ||
            "No se pudo anular el partido",
        );
      } finally {
        setActionLoading(
          false,
        );
      }
    };

  const renderUsers =
    () => {
      if (selectedUser) {
        return (
          <section className="admin-panel">
            <button
              type="button"
              className="admin-back"
              onClick={() =>
                setSelectedUser(
                  null,
                )
              }
            >
              ← Volver a pendientes
            </button>

            <div className="admin-section-heading">
              <span>
                DOCUMENTACIÓN
              </span>

              <h2>
                {
                  selectedUser.name
                }
              </h2>
            </div>

            <div className="admin-profile-grid">
              <div>
                <small>
                  DNI
                </small>

                <strong>
                  {formatDni(
                    selectedUser.dni,
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Email
                </small>

                <strong>
                  {
                    selectedUser.email
                  }
                </strong>
              </div>

              <div>
                <small>
                  Teléfono
                </small>

                <strong>
                  {selectedUser.phone ||
                    "-"}
                </strong>
              </div>

              <div>
                <small>
                  Liga
                </small>

                <strong>
                  {selectedUser.gender ===
                  "female"
                    ? "Femenina"
                    : "Masculina"}
                </strong>
              </div>
            </div>

            <div className="admin-dni-grid">
              <div className="admin-dni-card">
                <h3>
                  Frente del DNI
                </h3>

                {selectedUser.dni_front_url ? (
                  <img
                    src={
                      selectedUser.dni_front_url
                    }
                    alt={`Frente del DNI de ${selectedUser.name}`}
                  />
                ) : (
                  <p>
                    No hay imagen disponible.
                  </p>
                )}
              </div>

              <div className="admin-dni-card">
                <h3>
                  Dorso del DNI
                </h3>

                {selectedUser.dni_back_url ? (
                  <img
                    src={
                      selectedUser.dni_back_url
                    }
                    alt={`Dorso del DNI de ${selectedUser.name}`}
                  />
                ) : (
                  <p>
                    No hay imagen disponible.
                  </p>
                )}
              </div>
            </div>

            <div className="admin-actions">
              <button
                type="button"
                className="admin-button primary"
                disabled={
                  actionLoading
                }
                onClick={
                  approveUser
                }
              >
                Aprobar jugador
              </button>

              <button
                type="button"
                className="admin-button danger"
                disabled={
                  actionLoading
                }
                onClick={
                  rejectUser
                }
              >
                Rechazar
              </button>
            </div>
          </section>
        );
      }

      return (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <span>
              PENDIENTES
            </span>

            <h2>
              Jugadores por verificar
            </h2>
          </div>

          {loading ? (
            <p>
              Cargando jugadores...
            </p>
          ) : users.length ===
            0 ? (
            <div className="admin-empty">
              No hay jugadores pendientes de verificación.
            </div>
          ) : (
            <div className="admin-list">
              {users.map(
                (player) => (
                  <article
                    key={
                      player.id
                    }
                    className="admin-list-card"
                  >
                    <div>
                      <h3>
                        {
                          player.name
                        }
                      </h3>

                      <p>
                        DNI:{" "}
                        {formatDni(
                          player.dni,
                        )}
                      </p>

                      <p>
                        {player.gender ===
                        "female"
                          ? "Liga Femenina"
                          : "Liga Masculina"}
                      </p>
                    </div>

                    <button
                      type="button"
                      className="admin-button secondary"
                      onClick={() =>
                        openUser(
                          player.id,
                        )
                      }
                      disabled={
                        loadingUser
                      }
                    >
                      Ver documentación
                    </button>
                  </article>
                ),
              )}
            </div>
          )}
        </section>
      );
    };

  const renderAudit =
    () => {
      if (
        selectedAudit
      ) {
        const {
          match,
          flags,
          elo_events,
          audit_events,
        } = selectedAudit;

        return (
          <section className="admin-panel">
            <button
              type="button"
              className="admin-back"
              onClick={() =>
                setSelectedAudit(
                  null,
                )
              }
            >
              ← Volver a auditoría
            </button>

            <div className="admin-section-heading">
              <span>
                PARTIDO #{match.id}
              </span>

              <h2>
                {
                  match.player1_name
                }{" "}
                vs{" "}
                {
                  match.player2_name
                }
              </h2>
            </div>

            <div className="audit-match-summary">
              <div>
                <small>
                  Estado
                </small>

                <strong>
                  {
                    match.status
                  }
                </strong>
              </div>

              <div>
                <small>
                  Programado
                </small>

                <strong>
                  {formatDateTime(
                    match.scheduled_at,
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Lugar
                </small>

                <strong>
                  {match.venue ||
                    "-"}
                </strong>
              </div>

              <div>
                <small>
                  Resultado
                </small>

                <strong>
                  {formatScore(
                    match.score,
                  )}
                </strong>
              </div>

              <div>
                <small>
                  Ganador
                </small>

                <strong>
                  {match.winner_name ||
                    "-"}
                </strong>
              </div>

              <div>
                <small>
                  Finalizado
                </small>

                <strong>
                  {formatDateTime(
                    match.completed_at,
                  )}
                </strong>
              </div>
            </div>

            {match.annulled_at && (
              <div className="admin-annulled">
                <strong>
                  PARTIDO ANULADO
                </strong>

                <p>
                  {
                    match.annul_reason
                  }
                </p>

                <small>
                  {formatDateTime(
                    match.annulled_at,
                  )}
                </small>
              </div>
            )}

            <div className="audit-block">
              <div className="admin-section-heading compact">
                <span>
                  ALERTAS
                </span>

                <h3>
                  Motivos de revisión
                </h3>
              </div>

              {flags.length ===
              0 ? (
                <div className="admin-empty">
                  Este partido no tiene alertas.
                </div>
              ) : (
                <div className="audit-flags">
                  {flags.map(
                    (flag) => (
                      <article
                        key={
                          flag.id
                        }
                        className={
                          flag.resolved
                            ? "audit-flag resolved"
                            : "audit-flag"
                        }
                      >
                        <div>
                          <span>
                            {flagLabels[
                              flag.flag_type
                            ] ||
                              flag.flag_type}
                          </span>

                          <p>
                            {
                              flag.message
                            }
                          </p>

                          <small>
                            {formatDateTime(
                              flag.created_at,
                            )}
                          </small>
                        </div>

                        {flag.resolved ? (
                          <strong className="audit-resolved">
                            Revisada
                          </strong>
                        ) : (
                          <button
                            type="button"
                            className="admin-button secondary"
                            disabled={
                              actionLoading
                            }
                            onClick={() =>
                              resolveFlag(
                                flag.id,
                              )
                            }
                          >
                            Marcar revisada
                          </button>
                        )}
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="audit-block">
              <div className="admin-section-heading compact">
                <span>
                  ELO
                </span>

                <h3>
                  Movimientos del partido
                </h3>
              </div>

              {elo_events.length ===
              0 ? (
                <div className="admin-empty">
                  No hay movimientos Elo registrados.
                </div>
              ) : (
                <div className="audit-elo-list">
                  {elo_events.map(
                    (event) => (
                      <article
                        key={
                          event.id
                        }
                        className="audit-elo-row"
                      >
                        <div>
                          <strong>
                            {
                              event.player_name
                            }
                          </strong>

                          <small>
                            {
                              event.event_type
                            }
                          </small>
                        </div>

                        <span>
                          {
                            event.elo_before
                          }
                          {" → "}
                          {
                            event.elo_after
                          }
                        </span>

                        <strong
                          className={
                            Number(
                              event.elo_change,
                            ) >= 0
                              ? "audit-positive"
                              : "audit-negative"
                          }
                        >
                          {Number(
                            event.elo_change,
                          ) > 0
                            ? "+"
                            : ""}
                          {
                            event.elo_change
                          }
                        </strong>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>

            <div className="audit-block">
              <div className="admin-section-heading compact">
                <span>
                  TRAZABILIDAD
                </span>

                <h3>
                  Historial del partido
                </h3>
              </div>

              {audit_events.length ===
              0 ? (
                <div className="admin-empty">
                  No hay eventos registrados.
                </div>
              ) : (
                <div className="audit-timeline">
                  {audit_events.map(
                    (event) => (
                      <article
                        key={
                          event.id
                        }
                      >
                        <strong>
                          {
                            event.event_type
                          }
                        </strong>

                        <span>
                          {event.user_name ||
                            "Sistema"}
                        </span>

                        <small>
                          {formatDateTime(
                            event.created_at,
                          )}
                        </small>
                      </article>
                    ),
                  )}
                </div>
              )}
            </div>

            {!match.annulled_at &&
              match.status ===
                "completed" && (
                <div className="admin-danger-zone">
                  <span>
                    ZONA DE CONTROL
                  </span>

                  <h3>
                    Anular partido
                  </h3>

                  <p>
                    El partido seguirá registrado, pero se marcará como anulado y se revertirá automáticamente todo el Elo generado.
                  </p>

                  <button
                    type="button"
                    className="admin-button danger"
                    disabled={
                      actionLoading
                    }
                    onClick={
                      annulMatch
                    }
                  >
                    Anular partido y revertir Elo
                  </button>
                </div>
              )}
          </section>
        );
      }

      return (
        <section className="admin-panel">
          <div className="admin-section-heading">
            <span>
              FAIR PLAY
            </span>

            <h2>
              Auditoría de partidos
            </h2>

            <p>
              Revisá encuentros marcados automáticamente por comportamientos inusuales.
            </p>
          </div>

          {loading ? (
            <p>
              Cargando auditoría...
            </p>
          ) : auditMatches.length ===
            0 ? (
            <div className="admin-empty">
              No hay partidos marcados para revisión.
            </div>
          ) : (
            <div className="audit-match-list">
              {auditMatches.map(
                (match) => (
                  <article
                    className="audit-match-card"
                    key={
                      match.id
                    }
                  >
                    <div>
                      <span>
                        PARTIDO #
                        {
                          match.id
                        }
                      </span>

                      <h3>
                        {
                          match.player1_name
                        }{" "}
                        <i>
                          vs
                        </i>{" "}
                        {
                          match.player2_name
                        }
                      </h3>

                      <p>
                        {match.venue ||
                          "Lugar sin registrar"}
                      </p>

                      <small>
                        {formatDateTime(
                          match.completed_at ||
                            match.scheduled_at,
                        )}
                      </small>
                    </div>

                    <div className="audit-match-right">
                      <span
                        className={
                          Number(
                            match.unresolved_flags,
                          ) >
                          0
                            ? "audit-counter alert"
                            : "audit-counter"
                        }
                      >
                        {
                          match.unresolved_flags
                        }
                        {" "}
                        pendientes
                      </span>

                      <button
                        type="button"
                        className="admin-button secondary"
                        disabled={
                          loadingAudit
                        }
                        onClick={() =>
                          openAuditMatch(
                            match.id,
                          )
                        }
                      >
                        Revisar partido
                      </button>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>
      );
    };

  return (
    <main className="admin-page">
      <div className="site-width admin-content">
        <header className="admin-header">
          <span>
            ADMINISTRACIÓN
          </span>

          <h1>
            Panel de control
          </h1>

          <p>
            Verificación de jugadores, auditoría de partidos y control del fair play.
          </p>
        </header>

        <div className="admin-tabs">
          <button
            className={
              activeTab ===
              "users"
                ? "active"
                : ""
            }
            onClick={() =>
              switchTab(
                "users",
              )
            }
          >
            Jugadores
          </button>

          <button
            className={
              activeTab ===
              "audit"
                ? "active"
                : ""
            }
            onClick={() =>
              switchTab(
                "audit",
              )
            }
          >
            Auditoría
          </button>
        </div>

        {message && (
          <div className="admin-success">
            {message}
          </div>
        )}

        {error && (
          <div className="admin-error">
            {error}
          </div>
        )}

        {activeTab ===
        "users"
          ? renderUsers()
          : renderAudit()}
      </div>
    </main>
  );
}