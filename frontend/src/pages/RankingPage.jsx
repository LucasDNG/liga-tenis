import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useSearchParams,
} from "react-router-dom";

import { api } from "../api";

import {
  useAuth,
} from "../context/AuthContext";

import "./RankingPage.css";

function ChallengeButton({
  player,
  availability,
  sending,
  anySending,
  onChallenge,
}) {
  /*
    Usuario no logueado:
    no mostramos botón de desafío.
  */
  if (!availability) {
    return "—";
  }

  const disabled =
    !availability.can_challenge ||
    anySending;

  const tooltip =
    availability.message;

  return (
    <span
      className={
        disabled
          ? "ranking-action-wrap disabled"
          : "ranking-action-wrap"
      }
      tabIndex={
        disabled ? 0 : undefined
      }
    >
      <button
        className="small-action ranking-challenge-button"
        disabled={disabled}
        onClick={() =>
          onChallenge(
            player.id,
          )
        }
      >
        {sending
          ? "ENVIANDO..."
          : "Desafiar"}
      </button>

      {disabled &&
        tooltip && (
          <span className="ranking-tooltip">
            {tooltip}
          </span>
        )}
    </span>
  );
}

export default function RankingPage() {
  const { user } =
    useAuth();

  const [
    params,
    setParams,
  ] = useSearchParams();

  const initial =
    params.get("gender") ||
    user?.gender ||
    "male";

  const [
    league,
    setLeague,
  ] = useState(initial);

  const [
    players,
    setPlayers,
  ] = useState([]);

  const [
    availability,
    setAvailability,
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
    challengingId,
    setChallengingId,
  ] = useState(null);

  const load =
    async () => {
      try {
        setLoading(true);
        setMessage("");

        setParams({
          gender: league,
        });

        /*
          Ranking siempre público.
        */
        const rankingResponse =
          await api.get(
            `/ranking?gender=${league}`,
          );

        setPlayers(
          rankingResponse
            .data
            .players ||
            [],
        );

        /*
          Las reglas de desafío solo
          las consultamos si hay sesión.

          Además solamente tienen sentido
          viendo la liga propia del usuario.
        */
        if (
          user &&
          user.gender === league &&
          user.role !== "admin"
        ) {
          try {
            const availabilityResponse =
              await api.get(
                "/challenge-availability",
              );

            setAvailability(
              availabilityResponse
                .data
                .availability ||
                {},
            );
          } catch {
            setAvailability(
              {},
            );
          }
        } else {
          setAvailability(
            {},
          );
        }
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo cargar el ranking",
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    load();
  }, [
    league,
    user?.id,
    user?.gender,
  ]);

  const challenge =
    async (id) => {
      if (challengingId) {
        return;
      }

      try {
        setMessage("");

        setChallengingId(
          id,
        );

        const { data } =
          await api.post(
            "/challenges",
            {
              challenged_id:
                id,
            },
          );

        setMessage(
          data.message,
        );

        /*
          Importantísimo:
          volvemos a consultar
          disponibilidad.

          Así ese mismo botón queda
          inmediatamente bloqueado
          como "Ya existe un desafío".
        */
        await load();
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo crear el desafío",
        );

        /*
          Si el backend descubrió alguna
          regla nueva, refrescamos igualmente.
        */
        await load();
      } finally {
        setChallengingId(
          null,
        );
      }
    };

  const isVerified =
    user?.verification_status ===
    "verified";

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="page-heading">
          <div>
            <span>
              CLASIFICACIÓN
            </span>

            <h1>
              Ranking
            </h1>
          </div>

          <div className="league-switch">
            <button
              className={
                league ===
                "male"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague(
                  "male",
                )
              }
            >
              Masculina
            </button>

            <button
              className={
                league ===
                "female"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague(
                  "female",
                )
              }
            >
              Femenina
            </button>
          </div>
        </div>

        {!user && (
          <div className="notice">
            Podés consultar libremente
            el ranking y los perfiles.
            Iniciá sesión para desafiar
            jugadores.
          </div>
        )}

        {!isVerified &&
          user &&
          user.role !==
            "admin" && (
            <div className="notice">
              Tu cuenta todavía no
              está habilitada para
              competir. Podés consultar
              el ranking, pero los
              desafíos permanecerán
              bloqueados hasta que tu
              identidad sea verificada.
            </div>
          )}

        {message && (
          <div className="notice">
            {message}
          </div>
        )}

        {loading ? (
          <div className="notice">
            Cargando ranking...
          </div>
        ) : (
          <div className="ranking-box">
            <div className="ranking-head">
              <span>
                #
              </span>

              <span>
                Jugador
              </span>

              <span>
                Elo
              </span>

              <span>
                Partidos
              </span>

              <span>
                Acción
              </span>
            </div>

            {players.map(
              (player) => {
                const sending =
                  challengingId ===
                  player.id;

                /*
                  Si el usuario está
                  mirando otra liga,
                  explicamos el bloqueo
                  localmente.
                */
                let playerAvailability =
                  availability[
                    player.id
                  ];

                if (
                  user &&
                  user.gender !==
                    league
                ) {
                  playerAvailability = {
                    can_challenge:
                      false,

                    reason:
                      "different_league",

                    message:
                      "Solo podés desafiar jugadores de tu propia liga.",
                  };
                }

                /*
                  El administrador no participa.
                */
                if (
                  user?.role ===
                  "admin"
                ) {
                  playerAvailability =
                    null;
                }

                return (
                  <div
                    className="ranking-row"
                    key={
                      player.id
                    }
                  >
                    <span className="rank-digit">
                      {String(
                        player.rank_position,
                      ).padStart(
                        2,
                        "0",
                      )}
                    </span>

                    <strong>
                      <Link
                        className="ranking-player-link"
                        to={`/jugadores/${player.id}`}
                      >
                        {
                          player.name
                        }
                      </Link>

                      {player.id ===
                        user?.id && (
                        <em>
                          {" "}
                          VOS
                        </em>
                      )}
                    </strong>

                    <span>
                      {
                        player.rating
                      }
                    </span>

                    <span>
                      {
                        player.matches_played
                      }
                    </span>

                    <span>
                      <ChallengeButton
                        player={
                          player
                        }
                        availability={
                          user
                            ? playerAvailability
                            : null
                        }
                        sending={
                          sending
                        }
                        anySending={
                          Boolean(
                            challengingId,
                          )
                        }
                        onChallenge={
                          challenge
                        }
                      />
                    </span>
                  </div>
                );
              },
            )}
          </div>
        )}
      </div>
    </main>
  );
}