import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function RankingPage() {
  const { user } = useAuth();

  const [params, setParams] =
    useSearchParams();

  const initial =
    params.get("gender") ||
    user?.gender ||
    "male";

  const [league, setLeague] =
    useState(initial);

  const [players, setPlayers] =
    useState([]);

  const [message, setMessage] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [challengingId, setChallengingId] =
    useState(null);

  useEffect(() => {
    const loadRanking = async () => {
      try {
        setLoading(true);
        setMessage("");

        setParams({
          gender: league,
        });

        const { data } =
          await api.get(
            `/ranking?gender=${league}`,
          );

        setPlayers(data.players);
      } catch (error) {
        setMessage(
          error.response?.data?.message ||
            "No se pudo cargar el ranking",
        );
      } finally {
        setLoading(false);
      }
    };

    loadRanking();
  }, [league, setParams]);

  const challenge = async (id) => {
    if (challengingId) return;

    try {
      setMessage("");
      setChallengingId(id);

      const { data } =
        await api.post(
          "/challenges",
          {
            challenged_id: id,
          },
        );

      setMessage(data.message);
    } catch (error) {
      setMessage(
        error.response?.data?.message ||
          "No se pudo crear el desafío",
      );
    } finally {
      setChallengingId(null);
    }
  };

  const myPosition =
    players.find(
      (player) =>
        player.id === user?.id,
    )?.rank_position;

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

            <h1>Ranking</h1>
          </div>

          <div className="league-switch">
            <button
              className={
                league === "male"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague("male")
              }
            >
              Masculina
            </button>

            <button
              className={
                league === "female"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setLeague("female")
              }
            >
              Femenina
            </button>
          </div>
        </div>

        {!isVerified && user && (
          <div className="notice">
            Tu cuenta todavía no está habilitada para competir.
            Podés ver el ranking, pero para desafiar jugadores
            primero tenés que tener la identidad verificada.
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
              <span>#</span>
              <span>Jugador</span>
              <span>Elo</span>
              <span>Partidos</span>
              <span>Acción</span>
            </div>

            {players.map(
              (player) => {
                const canChallenge =
                  user &&
                  isVerified &&
                  user.gender === league &&
                  player.id !== user.id &&
                  myPosition &&
                  player.rank_position <
                    myPosition &&
                  myPosition -
                    player.rank_position <=
                    3;

                const isSending =
                  challengingId ===
                  player.id;

                return (
                  <div
                    className="ranking-row"
                    key={player.id}
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
                      {player.name}

                      {player.id ===
                        user?.id && (
                        <em>
                          {" "}
                          VOS
                        </em>
                      )}
                    </strong>

                    <span>
                      {player.rating}
                    </span>

                    <span>
                      {
                        player.matches_played
                      }
                    </span>

                    <span>
                      {canChallenge ? (
                        <button
                          className="small-action"
                          onClick={() =>
                            challenge(
                              player.id,
                            )
                          }
                          disabled={
                            Boolean(
                              challengingId,
                            )
                          }
                          style={{
                            opacity:
                              challengingId
                                ? 0.7
                                : 1,
                            cursor:
                              challengingId
                                ? "wait"
                                : "pointer",
                          }}
                        >
                          {isSending
                            ? "ENVIANDO..."
                            : "Desafiar"}
                        </button>
                      ) : (
                        "—"
                      )}
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