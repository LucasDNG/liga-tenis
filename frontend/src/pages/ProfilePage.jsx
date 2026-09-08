import {
  useState,
} from "react";

import {
  api,
} from "../api";

import {
  useAuth,
} from "../context/AuthContext";

import "./ProfilePage.css";


export default function ProfilePage() {
  const {
    user,
    setUser,
  } =
    useAuth();

  const [
    message,
    setMessage,
  ] =
    useState("");


  const choose =
    async (
      gender,
    ) => {
      try {
        const {
          data,
        } =
          await api.patch(
            "/profile/league",
            {
              gender,
            },
          );

        setUser(
          data,
        );

        setMessage(
          "Liga actualizada.",
        );
      } catch (error) {
        setMessage(
          error.response
            ?.data
            ?.message ||
            "No se pudo actualizar la liga",
        );
      }
    };


  const verificationStatus =
    user
      ?.verification_status;

  const isVerified =
    verificationStatus ===
    "verified";

  const isRejected =
    verificationStatus ===
    "rejected";

  const isPending =
    verificationStatus ===
    "pending_verification";


  const verificationLabel =
    isVerified
      ? "Verificado"
      : isRejected
        ? "Rechazado"
        : "Pendiente";


  const leagueLabel =
    user?.gender ===
    "female"
      ? "Liga Femenina"
      : user?.gender ===
          "male"
        ? "Liga Masculina"
        : "Liga pendiente";


  const verificationClass =
    isVerified
      ? "verified"
      : isRejected
        ? "rejected"
        : "pending";


  return (
    <main className="page-dark profile-page">
      <div className="site-width page-content">

        <section className="profile-hero">

          <div>
            <div className="profile-brand-tags">
              <span>
                LA RED
              </span>

              <span>
                TENIS
              </span>

              <span>
                SAN PEDRO
              </span>
            </div>

            <span className="profile-kicker">
              MI CUENTA
            </span>

            <h1>
              Mi perfil
            </h1>

            <p>
              Tu lugar dentro de
              La Red: liga, Elo,
              partidos y estado
              de tu cuenta.
            </p>
          </div>


          <div
            className={`profile-verification-badge ${verificationClass}`}
          >
            <small>
              IDENTIDAD
            </small>

            <strong>
              {
                verificationLabel
              }
            </strong>
          </div>

        </section>


        <section className="profile-overview">

          <div className="profile-player">

            <div className="profile-player-main">
              <span className="profile-eyebrow">
                JUGADOR · LA RED
              </span>

              <h2>
                {user?.name ||
                  "Jugador"}
              </h2>

              <p className="profile-league">
                {
                  leagueLabel
                }
                {" · "}
                San Pedro
              </p>
            </div>


            <div className="profile-player-mark">
              <strong>
                LR
              </strong>

              <span>
                TENIS
              </span>
            </div>

          </div>


          <div className="profile-stats">

            <article className="profile-stat">
              <div>
                <small>
                  ELO ACTUAL
                </small>

                <strong>
                  {user?.rating ??
                    "—"}
                </strong>
              </div>

              <span>
                ELO
              </span>
            </article>


            <article className="profile-stat">
              <div>
                <small>
                  PARTIDOS
                </small>

                <strong>
                  {user?.matches_played ??
                    0}
                </strong>
              </div>

              <span>
                PJ
              </span>
            </article>


            <article
              className={`profile-stat profile-stat-verification ${verificationClass}`}
            >
              <div>
                <small>
                  IDENTIDAD
                </small>

                <strong>
                  {
                    verificationLabel
                  }
                </strong>
              </div>

              <span>
                {isVerified
                  ? "✓"
                  : isRejected
                    ? "!"
                    : "…"}
              </span>
            </article>

          </div>


          {isPending && (
            <div className="profile-notice pending">

              <div className="profile-notice-icon">
                …
              </div>

              <div>
                <span className="profile-eyebrow">
                  VERIFICACIÓN
                </span>

                <h3>
                  Estamos revisando tu identidad
                </h3>

                <p>
                  Recibimos las fotos
                  de tu DNI y están
                  pendientes de revisión.
                </p>

                <p>
                  Mientras tanto podés
                  ingresar, consultar
                  La Red y ver el ranking,
                  pero todavía no podés
                  competir.
                </p>
              </div>

            </div>
          )}


          {isVerified && (
            <div className="profile-notice verified">

              <div className="profile-notice-icon">
                ✓
              </div>

              <div>
                <span className="profile-eyebrow">
                  CUENTA HABILITADA
                </span>

                <h3>
                  Ya formás parte de La Red
                </h3>

                <p>
                  Tu identidad fue
                  aprobada y tu cuenta
                  está habilitada para
                  competir.
                </p>

                <p>
                  Podés crear desafíos,
                  recibir desafíos y
                  registrar tus partidos.
                </p>
              </div>

            </div>
          )}


          {isRejected && (
            <div className="profile-notice rejected">

              <div className="profile-notice-icon">
                !
              </div>

              <div>
                <span className="profile-eyebrow">
                  DOCUMENTACIÓN
                </span>

                <h3>
                  La verificación fue rechazada
                </h3>

                <p>
                  Las imágenes enviadas
                  no pudieron ser
                  aprobadas.
                </p>

                <p>
                  Por el momento no
                  podés crear ni aceptar
                  desafíos.
                </p>
              </div>

            </div>
          )}


          {!user?.gender && (
            <div className="profile-choose-league">

              <div>
                <span className="profile-eyebrow">
                  LA RED · COMPETENCIA
                </span>

                <h3>
                  Elegí tu liga
                </h3>

                <p>
                  Necesitamos saber en
                  qué liga vas a competir
                  para ubicarte en el
                  ranking correcto.
                </p>
              </div>


              <div className="profile-league-actions">

                <button
                  type="button"
                  className="profile-league-button"
                  onClick={() =>
                    choose(
                      "male",
                    )
                  }
                >
                  <small>
                    LA RED
                  </small>

                  <strong>
                    Liga Masculina
                  </strong>
                </button>


                <button
                  type="button"
                  className="profile-league-button secondary"
                  onClick={() =>
                    choose(
                      "female",
                    )
                  }
                >
                  <small>
                    LA RED
                  </small>

                  <strong>
                    Liga Femenina
                  </strong>
                </button>

              </div>

            </div>
          )}


          {message && (
            <div className="profile-message">
              {
                message
              }
            </div>
          )}

        </section>

      </div>
    </main>
  );
}