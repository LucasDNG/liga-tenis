import { useState } from "react";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, setUser } = useAuth();

  const [message, setMessage] =
    useState("");

  const choose = async (gender) => {
    try {
      const { data } =
        await api.patch(
          "/profile/league",
          {
            gender,
          },
        );

      setUser(data);

      setMessage(
        "Liga actualizada.",
      );
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo actualizar la liga",
      );
    }
  };

  const verificationStatus =
    user?.verification_status;

  const isVerified =
    verificationStatus === "verified";

  const isRejected =
    verificationStatus === "rejected";

  const isPending =
    verificationStatus ===
    "pending_verification";

  const verificationLabel =
    isVerified
      ? "Verificado"
      : isRejected
        ? "Rechazado"
        : "Pendiente";

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="profile-dark">
          <span>JUGADOR</span>

          <h1>{user?.name}</h1>

          <p>
            {user?.gender === "female"
              ? "Liga Femenina"
              : user?.gender === "male"
                ? "Liga Masculina"
                : "Todavía no elegiste liga"}
          </p>

          <div className="profile-stats">
            <div>
              <small>ELO</small>
              <strong>
                {user?.rating}
              </strong>
            </div>

            <div>
              <small>PARTIDOS</small>
              <strong>
                {user?.matches_played}
              </strong>
            </div>

            <div>
              <small>IDENTIDAD</small>
              <strong>
                {verificationLabel}
              </strong>
            </div>
          </div>

          {isPending && (
            <div className="notice">
              <strong>
                Verificación pendiente
              </strong>

              <p>
                Recibimos las fotos de tu
                DNI. Tu identidad todavía
                está siendo revisada.
              </p>

              <p>
                Mientras tanto podés
                iniciar sesión, ver el
                ranking y consultar tu
                perfil, pero todavía no
                podés crear ni aceptar
                desafíos.
              </p>
            </div>
          )}

          {isVerified && (
            <div className="notice">
              <strong>
                Cuenta verificada
              </strong>

              <p>
                Tu identidad fue aprobada.
                Ya estás habilitado para
                competir, crear desafíos y
                aceptar desafíos de otros
                jugadores.
              </p>
            </div>
          )}

          {isRejected && (
            <div className="notice">
              <strong>
                Documentación rechazada
              </strong>

              <p>
                Las imágenes enviadas no
                pudieron ser aprobadas.
              </p>

              <p>
                Por el momento no podés
                crear ni aceptar desafíos.
              </p>
            </div>
          )}

          {!user?.gender && (
            <div className="choose-league">
              <h2>Elegí tu liga</h2>

              <p>
                Esto es necesario para
                aparecer en el ranking
                correcto y poder desafiar.
              </p>

              <button
                className="small-action"
                onClick={() =>
                  choose("male")
                }
              >
                Liga Masculina
              </button>

              <button
                className="small-action secondary"
                onClick={() =>
                  choose("female")
                }
              >
                Liga Femenina
              </button>
            </div>
          )}

          {message && (
            <div className="notice">
              {message}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}