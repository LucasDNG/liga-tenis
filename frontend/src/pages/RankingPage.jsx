import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import { api } from "../api";

import {
  useAuth,
} from "../context/AuthContext";

import "./RankingPage.css";


const PLACEMENT_MATCHES = 5;


function ChallengeButton({
  player,
  availability,
  sending,
  anySending,
  onChallenge,
}) {
  if (!availability) {
    return "—";
  }


  const disabled =
    !availability.can_challenge ||
    anySending;


  return (
    <span
      className={
        disabled
          ? "ranking-action-wrap disabled"
          : "ranking-action-wrap"
      }
      tabIndex={
        disabled
          ? 0
          : undefined
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
        availability.message && (
          <span className="ranking-tooltip">
            {
              availability.message
            }
          </span>
        )}
    </span>
  );
}


export default function RankingPage() {
  const { user } =
    useAuth();


  const navigate =
    useNavigate();


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
  ] = useState(
    initial,
  );


  const [
    officialPlayers,
    setOfficialPlayers,
  ] = useState([]);


  const [
    provisionalPlayers,
    setProvisionalPlayers,
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


  const [
    placementMatches,
    setPlacementMatches,
  ] = useState(
    PLACEMENT_MATCHES,
  );


  const load =
    async () => {
      try {
        setLoading(true);
        setMessage("");


        setParams({
          gender:
            league,
        });


        const rankingResponse =
          await api.get(
            `/ranking?gender=${league}`,
          );


        const data =
          rankingResponse.data;


        setPlacementMatches(
          Number(
            data
              .placement_matches,
          ) ||
            PLACEMENT_MATCHES,
        );


        setOfficialPlayers(
          data
            .official_players ||
            (
              data.players || []
            ).filter(
              (player) =>
                !player.provisional,
            ),
        );


        setProvisionalPlayers(
          data
            .provisional_players ||
            (
              data.players || []
            ).filter(
              (player) =>
                player.provisional,
            ),
        );


        if (
          user &&
          user.gender ===
            league &&
          user.role !==
            "admin"
        ) {
          try {
            const response =
              await api.get(
                "/challenge-availability",
              );


            setAvailability(
              response.data
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


  useEffect(
    () => {
      load();
    },
    [
      league,
      user?.id,
      user?.gender,
    ],
  );


  const challenge =
    async (
      id,
    ) => {
      if (
        challengingId
      ) {
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


        navigate(
          "/challenges",
          {
            state: {
              message:
                data.message,
            },
          },
        );
      } catch (error) {
        setMessage(
          error.response?.data
            ?.message ||
            "No se pudo crear el desafío",
        );


        await load();
      } finally {
        setChallengingId(
          null,
        );
      }
    };


  const isVerified =
    user
      ?.verification_status ===
    "verified";


  const getPlayerAvailability =
    (
      player,
    ) => {
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


      if (
        user?.role ===
        "admin"
      ) {
        return null;
      }


      return playerAvailability;
    };


  const renderPlayer =
    (
      player,
    ) => {
      const sending =
        challengingId ===
        player.id;


      const playerAvailability =
        getPlayerAvailability(
          player,
        );


      const matchesRemaining =
        Math.max(
          0,
          placementMatches -
            Number(
              player
                .matches_played,
            ),
        );


      return (
        <div
          className="ranking-row"
          key={player.id}
        >
          <span className="rank-digit">
            {player.provisional
              ? "PROV."
              : String(
                  player
                    .rank_position,
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
              {player.name}
            </Link>


            {player.id ===
              user?.id && (
              <em>
                {" "}
                VOS
              </em>
            )}


            {player.provisional && (
              <small
                title={`Le faltan ${matchesRemaining} partido(s) para ingresar al ranking oficial.`}
              >
                {" "}
                · PROVISIONAL
              </small>
            )}
          </strong>


          <span>
            {player.rating}
          </span>


          <span>
            {
              player
                .matches_played
            }
            {player.provisional
              ? `/${placementMatches}`
              : ""}
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
    };


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
          <>
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


              {officialPlayers.length >
              0 ? (
                officialPlayers.map(
                  renderPlayer,
                )
              ) : (
                <div className="notice">
                  Todavía no hay jugadores
                  con {placementMatches} partidos
                  para formar el ranking oficial.
                </div>
              )}
            </div>


            {provisionalPlayers.length >
              0 && (
              <>
                <div className="notice">
                  <strong>
                    Jugadores provisionales
                  </strong>
                  {" — "}
                  Necesitan completar
                  {" "}
                  {placementMatches}
                  {" "}
                  partidos para ingresar
                  al ranking oficial. Su
                  Elo ya se calcula desde
                  el primer partido.
                </div>


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


                  {provisionalPlayers.map(
                    renderPlayer,
                  )}
                </div>
              </>
            )}
          </>
        )}

      </div>
    </main>
  );
}