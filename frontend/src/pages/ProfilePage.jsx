import { useState } from "react";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";

import "./ProfilePage.css";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [message, setMessage] = useState("");

  const choose = async (gender) => {
    try {
      const { data } = await api.patch("/profile/league", {
        gender,
      });

      setUser(data);
      setMessage("Liga actualizada.");
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo actualizar la liga",
      );
    }
  };

  const verificationStatus = user?.verification_status;

  const isVerified = verificationStatus === "verified";
  const isRejected = verificationStatus === "rejected";
  const isPending =
    verificationStatus === "pending_verification";

  const verificationLabel = isVerified
    ? "Verificado"
    : isRejected
      ? "Rechazado"
      : "Pendiente";

  const leagueLabel =
    user?.gender === "female"
      ? "Liga Femenina"
      : user?.gender === "male"
        ? "Liga Masculina"
        : "Todavía no elegiste liga";

  return (
    <main className="page-dark profile-page">
      <div className="site-width page-content">
        <header className="page-heading profile-page-heading">
          <span>MI PERFIL</span>
          <h1>Perfil de jugador</h1>
          <p>
            Tu información, estado de cuenta y estadísticas
            dentro de la Liga de Tenis San Pedro.
          </p>
        </header>

        <section className="profile-overview">
          <div className="profile-player">
            <span className="profile-eyebrow">JUGADOR</span>

            <h2>{user?.name}</h2>

            <p className="profile-league">{leagueLabel}</p>
          </div>

          <div className="profile-stats">
            <div className="profile-stat">
              <small>ELO</small>
              <strong>{user?.rating ?? "—"}</strong>
            </div>

            <div className="profile-stat">
              <small>PARTIDOS</small>
              <strong>{user?.matches_played ?? 0}</strong>
            </div>

            <div className="profile-stat">
              <small>IDENTIDAD</small>
              <strong>{verificationLabel}</strong>
            </div>
          </div>

          {isPending && (
            <div className="profile-notice">
              <strong>Verificación pendiente</strong>

              <p>
                Recibimos las fotos de tu DNI. Tu identidad
                todavía está siendo revisada.
              </p>

              <p>
                Mientras tanto podés iniciar sesión, ver el
                ranking y consultar tu perfil, pero todavía no
                podés crear ni aceptar desafíos.
              </p>
            </div>
          )}

          {isVerified && (
            <div className="profile-notice">
              <strong>Cuenta verificada</strong>

              <p>
                Tu identidad fue aprobada. Ya estás habilitado
                para competir, crear desafíos y aceptar desafíos
                de otros jugadores.
              </p>
            </div>
          )}

          {isRejected && (
            <div className="profile-notice profile-notice-danger">
              <strong>Documentación rechazada</strong>

              <p>
                Las imágenes enviadas no pudieron ser aprobadas.
              </p>

              <p>
                Por el momento no podés crear ni aceptar
                desafíos.
              </p>
            </div>
          )}

          {!user?.gender && (
            <div className="profile-choose-league">
              <span className="profile-eyebrow">COMPETENCIA</span>

              <h3>Elegí tu liga</h3>

              <p>
                Esto es necesario para aparecer en el ranking
                correcto y poder desafiar a otros jugadores.
              </p>

              <div className="profile-league-actions">
                <button
                  className="small-action"
                  onClick={() => choose("male")}
                >
                  Liga Masculina
                </button>

                <button
                  className="small-action secondary"
                  onClick={() => choose("female")}
                >
                  Liga Femenina
                </button>
              </div>
            </div>
          )}

          {message && (
            <div className="profile-message">{message}</div>
          )}
        </section>
      </div>
    </main>
  );
}