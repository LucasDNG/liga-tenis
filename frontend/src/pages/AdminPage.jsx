import { useEffect, useState } from "react";
import { api } from "../api";

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [loadingUser, setLoadingUser] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  const loadPendingUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const { data } = await api.get(
        "/admin/users/pending",
      );

      setUsers(data.users || []);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudieron cargar los jugadores pendientes",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPendingUsers();
  }, []);

  const openUser = async (id) => {
    try {
      setLoadingUser(true);
      setError("");
      setMessage("");

      const { data } = await api.get(
        `/admin/users/${id}`,
      );

      setSelectedUser(data.user);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo cargar el jugador",
      );
    } finally {
      setLoadingUser(false);
    }
  };

  const approveUser = async () => {
    if (!selectedUser) return;

    const confirmed = window.confirm(
      `¿Aprobar a ${selectedUser.name}?`,
    );

    if (!confirmed) return;

    try {
      setError("");

      const { data } = await api.patch(
        `/admin/users/${selectedUser.id}/approve`,
      );

      setMessage(data.message);
      setSelectedUser(null);

      await loadPendingUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo aprobar el jugador",
      );
    }
  };

  const rejectUser = async () => {
    if (!selectedUser) return;

    const confirmed = window.confirm(
      `¿Rechazar la verificación de ${selectedUser.name}?`,
    );

    if (!confirmed) return;

    try {
      setError("");

      const { data } = await api.patch(
        `/admin/users/${selectedUser.id}/reject`,
      );

      setMessage(data.message);
      setSelectedUser(null);

      await loadPendingUsers();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo rechazar el jugador",
      );
    }
  };

  const formatDni = (dni) => {
    if (!dni) return "-";

    return String(dni).replace(
      /\B(?=(\d{3})+(?!\d))/g,
      ".",
    );
  };

  return (
    <main className="page-shell">
      <section className="page-header">
        <p className="eyebrow">
          ADMINISTRACIÓN
        </p>

        <h1>
          Verificación de jugadores
        </h1>

        <p>
          Revisá la documentación de los
          jugadores registrados antes de
          aprobar su identidad.
        </p>
      </section>

      {message && (
        <div className="success-box">
          {message}
        </div>
      )}

      {error && (
        <div className="error-box">
          {error}
        </div>
      )}

      {selectedUser ? (
        <section className="panel">
          <button
            type="button"
            className="text-link"
            onClick={() =>
              setSelectedUser(null)
            }
          >
            ← Volver a pendientes
          </button>

          <div className="section-heading">
            <p className="eyebrow">
              DOCUMENTACIÓN
            </p>

            <h2>
              {selectedUser.name}
            </h2>
          </div>

          <div className="profile-grid">
            <div>
              <strong>DNI</strong>
              <p>
                {formatDni(
                  selectedUser.dni,
                )}
              </p>
            </div>

            <div>
              <strong>Email</strong>
              <p>
                {selectedUser.email}
              </p>
            </div>

            <div>
              <strong>Teléfono</strong>
              <p>
                {selectedUser.phone ||
                  "-"}
              </p>
            </div>

            <div>
              <strong>Liga</strong>
              <p>
                {selectedUser.gender ===
                "female"
                  ? "Femenina"
                  : "Masculina"}
              </p>
            </div>
          </div>

          <div className="dni-grid">
            <div className="dni-card">
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

            <div className="dni-card">
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

          <div className="actions-row">
            <button
              type="button"
              className="primary-button"
              onClick={approveUser}
            >
              Aprobar jugador
            </button>

            <button
              type="button"
              className="secondary-button"
              onClick={rejectUser}
            >
              Rechazar
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <div className="section-heading">
            <p className="eyebrow">
              PENDIENTES
            </p>

            <h2>
              Jugadores por verificar
            </h2>
          </div>

          {loading ? (
            <p>
              Cargando jugadores...
            </p>
          ) : users.length === 0 ? (
            <p>
              No hay jugadores pendientes
              de verificación.
            </p>
          ) : (
            <div className="stack-list">
              {users.map((player) => (
                <article
                  key={player.id}
                  className="list-card"
                >
                  <div>
                    <h3>
                      {player.name}
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
                    className="secondary-button"
                    onClick={() =>
                      openUser(player.id)
                    }
                    disabled={
                      loadingUser
                    }
                  >
                    Ver documentación
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}