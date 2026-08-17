import { Link } from "react-router-dom";

export default function EloPage() {
  return (
    <main className="page-dark">
      <div
        className="site-width page-content"
        style={{
          maxWidth: "1050px",
        }}
      >
        <div className="page-heading">
          <div>
            <span>RANKING DE LA LIGA</span>
            <h1>¿Cómo funciona el Elo?</h1>
          </div>
        </div>

        {/* INTRODUCCIÓN */}

        <section
          style={{
            maxWidth: "800px",
            marginBottom: "48px",
          }}
        >
          <p
            style={{
              color: "#c9cdc6",
              fontSize: "19px",
              lineHeight: "1.8",
              marginTop: 0,
            }}
          >
            El sistema Elo es la forma que usamos para medir el
            nivel competitivo de cada jugador.
          </p>

          <p
            style={{
              color: "#9da79f",
              fontSize: "16px",
              lineHeight: "1.8",
            }}
          >
            Todos los jugadores comienzan con{" "}
            <strong style={{ color: "#9bbe61" }}>
              1500 puntos Elo
            </strong>
            . A partir de ahí, el puntaje cambia según los
            resultados de los partidos.
          </p>

          <p
            style={{
              color: "#9da79f",
              fontSize: "16px",
              lineHeight: "1.8",
            }}
          >
            El objetivo es que, con el paso de los partidos, cada
            jugador termine ubicado cerca de otros jugadores de un
            nivel similar.
          </p>
        </section>

        {/* PRINCIPIOS BÁSICOS */}

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "18px",
            marginBottom: "56px",
          }}
        >
          <article className="card-dark">
            <span className="card-label">
              SI GANÁS
            </span>

            <h2>Sumás puntos</h2>

            <p
              style={{
                color: "#aab3ac",
                lineHeight: "1.7",
                marginBottom: 0,
              }}
            >
              Cuando ganás un partido, tu Elo aumenta. Pero no
              todas las victorias entregan la misma cantidad de
              puntos.
            </p>
          </article>

          <article className="card-dark">
            <span className="card-label">
              SI PERDÉS
            </span>

            <h2>Restás puntos</h2>

            <p
              style={{
                color: "#aab3ac",
                lineHeight: "1.7",
                marginBottom: 0,
              }}
            >
              Cuando perdés, tu Elo disminuye. La cantidad que
              perdés también depende del nivel que tenía tu rival.
            </p>
          </article>

          <article className="card-dark">
            <span className="card-label">
              TU RIVAL IMPORTA
            </span>

            <h2>No todos los partidos valen igual</h2>

            <p
              style={{
                color: "#aab3ac",
                lineHeight: "1.7",
                marginBottom: 0,
              }}
            >
              Ganarle a un jugador con más Elo tiene más valor que
              ganarle a alguien que estaba claramente por debajo
              tuyo.
            </p>
          </article>
        </div>

        {/* PARTIDOS NIVELATORIOS */}

        <section
          style={{
            border: "1px solid #456039",
            borderLeft: "4px solid #9bbe61",
            background:
              "linear-gradient(135deg, #0b1710, #0d1b12)",
            padding: "32px",
            marginBottom: "56px",
          }}
        >
          <span className="card-label">
            CUANDO RECIÉN ENTRÁS A LA LIGA
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "36px",
              fontWeight: 400,
              margin: "10px 0 22px",
            }}
          >
            Tus primeros 5 partidos son nivelatorios
          </h2>

          <p
            style={{
              color: "#c9cdc6",
              fontSize: "17px",
              lineHeight: "1.8",
              maxWidth: "820px",
            }}
          >
            Cuando un jugador se registra todavía no tenemos
            suficiente información para saber cuál es su nivel
            real. Por eso todos comienzan en 1500 Elo, pero los
            primeros cinco partidos tienen una importancia
            especial.
          </p>

          <p
            style={{
              color: "#aab3ac",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "820px",
            }}
          >
            Durante esos primeros encuentros, el Elo puede subir o
            bajar más rápido. Esto permite que el sistema encuentre
            antes una posición adecuada para cada jugador.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
              marginTop: "28px",
            }}
          >
            <div
              style={{
                border: "1px solid #293d2e",
                padding: "22px",
                background: "#09130d",
              }}
            >
              <span
                style={{
                  color: "#9bbe61",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                }}
              >
                PARTIDOS 1 A 5
              </span>

              <h3
                style={{
                  margin: "12px 0 10px",
                  fontSize: "18px",
                }}
              >
                Elo más sensible
              </h3>

              <p
                style={{
                  margin: 0,
                  color: "#9ea9a0",
                  lineHeight: "1.7",
                  fontSize: "14px",
                }}
              >
                Las victorias y derrotas producen movimientos más
                grandes para ayudar a encontrar rápidamente tu
                nivel.
              </p>
            </div>

            <div
              style={{
                border: "1px solid #293d2e",
                padding: "22px",
                background: "#09130d",
              }}
            >
              <span
                style={{
                  color: "#9bbe61",
                  fontSize: "12px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                }}
              >
                DESDE EL PARTIDO 6
              </span>

              <h3
                style={{
                  margin: "12px 0 10px",
                  fontSize: "18px",
                }}
              >
                Elo estable
              </h3>

              <p
                style={{
                  margin: 0,
                  color: "#9ea9a0",
                  lineHeight: "1.7",
                  fontSize: "14px",
                }}
              >
                Una vez terminada la etapa nivelatoria, los cambios
                pasan a ser más moderados y el ranking se vuelve
                más estable.
              </p>
            </div>
          </div>

          <p
            style={{
              color: "#c9cdc6",
              lineHeight: "1.8",
              margin: "28px 0 0",
              maxWidth: "820px",
            }}
          >
            Esto no significa que un jugador nuevo tenga ventaja.
            El objetivo es simplemente{" "}
            <strong style={{ color: "#9bbe61" }}>
              ubicarlo más rápido en una zona acorde a su nivel
            </strong>
            .
          </p>
        </section>

        {/* EJEMPLO IGUALDAD */}

        <section
          style={{
            borderTop: "1px solid #243529",
            borderBottom: "1px solid #243529",
            padding: "38px 0",
            marginBottom: "48px",
          }}
        >
          <span className="card-label">
            UN EJEMPLO SIMPLE
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "32px",
              fontWeight: 400,
              margin: "10px 0 12px",
            }}
          >
            Dos jugadores con el mismo nivel
          </h2>

          <p
            style={{
              color: "#8f9b91",
              lineHeight: "1.7",
              maxWidth: "760px",
              marginBottom: "28px",
            }}
          >
            Supongamos que ambos jugadores ya terminaron sus cinco
            partidos nivelatorios.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(240px, 1fr))",
              gap: "16px",
            }}
          >
            <div
              style={{
                border: "1px solid #243529",
                padding: "24px",
                background: "#0b1510",
              }}
            >
              <span
                style={{
                  color: "#849087",
                  fontSize: "11px",
                  letterSpacing: "0.12em",
                }}
              >
                ANTES DEL PARTIDO
              </span>

              <p
                style={{
                  margin: "18px 0 8px",
                  fontSize: "17px",
                }}
              >
                Marcos{" "}
                <strong style={{ color: "#9bbe61" }}>
                  1500 Elo
                </strong>
              </p>

              <p
                style={{
                  margin: 0,
                  fontSize: "17px",
                }}
              >
                Lucas{" "}
                <strong style={{ color: "#9bbe61" }}>
                  1500 Elo
                </strong>
              </p>
            </div>

            <div
              style={{
                border: "1px solid #34502e",
                borderLeft: "3px solid #9bbe61",
                padding: "24px",
                background: "#0b1510",
              }}
            >
              <span
                style={{
                  color: "#849087",
                  fontSize: "11px",
                  letterSpacing: "0.12em",
                }}
              >
                SI MARCOS GANA
              </span>

              <p
                style={{
                  margin: "18px 0 8px",
                  fontSize: "17px",
                }}
              >
                Marcos{" "}
                <strong style={{ color: "#9bbe61" }}>
                  1516 Elo
                </strong>
              </p>

              <p
                style={{
                  margin: 0,
                  fontSize: "17px",
                }}
              >
                Lucas{" "}
                <strong style={{ color: "#d5bd6a" }}>
                  1484 Elo
                </strong>
              </p>
            </div>
          </div>

          <p
            style={{
              marginTop: "22px",
              color: "#849087",
              fontSize: "13px",
              lineHeight: "1.7",
            }}
          >
            Durante los cinco partidos nivelatorios, el movimiento
            puede ser mayor porque el sistema todavía está tratando
            de determinar el nivel real del jugador.
          </p>
        </section>

        {/* RIVAL DE DIFERENTE ELO */}

        <section
          style={{
            marginBottom: "48px",
          }}
        >
          <span className="card-label">
            LA PARTE MÁS IMPORTANTE
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "34px",
              fontWeight: 400,
              margin: "10px 0 20px",
            }}
          >
            Ganarle a alguien mejor vale más
          </h2>

          <p
            style={{
              color: "#aab3ac",
              lineHeight: "1.8",
              fontSize: "16px",
              maxWidth: "780px",
            }}
          >
            Supongamos que un jugador tiene 1400 Elo y enfrenta a
            otro que tiene 1600. El jugador de 1600 llega como
            favorito.
          </p>

          <p
            style={{
              color: "#aab3ac",
              lineHeight: "1.8",
              fontSize: "16px",
              maxWidth: "780px",
            }}
          >
            Si gana el jugador de 1600, el sistema considera que
            ocurrió algo bastante esperable. Por eso gana pocos
            puntos.
          </p>

          <p
            style={{
              color: "#c9cdc6",
              lineHeight: "1.8",
              fontSize: "17px",
              maxWidth: "780px",
            }}
          >
            Pero si el jugador de{" "}
            <strong style={{ color: "#9bbe61" }}>
              1400 le gana al de 1600
            </strong>
            , consiguió un resultado mucho más difícil y recibe una
            cantidad mayor de puntos Elo.
          </p>
        </section>

        {/* PÉRDIDAS */}

        <section
          style={{
            background: "#0b1510",
            border: "1px solid #34502e",
            padding: "30px",
            marginBottom: "48px",
          }}
        >
          <span className="card-label">
            TAMBIÉN FUNCIONA AL REVÉS
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "32px",
              fontWeight: 400,
              margin: "10px 0 20px",
            }}
          >
            Perder contra un jugador fuerte te perjudica menos
          </h2>

          <p
            style={{
              color: "#c9cdc6",
              fontSize: "17px",
              lineHeight: "1.8",
              marginBottom: 0,
              maxWidth: "800px",
            }}
          >
            Si enfrentás a alguien que tiene bastante más Elo que
            vos y perdés, el sistema entiende que era un resultado
            probable. Por eso la pérdida de puntos es menor.
          </p>

          <p
            style={{
              color: "#c9cdc6",
              fontSize: "17px",
              lineHeight: "1.8",
              marginBottom: 0,
              maxWidth: "800px",
            }}
          >
            En cambio, si perdés frente a un jugador que tenía
            bastante menos Elo, la caída es mayor porque el
            resultado fue inesperado.
          </p>
        </section>

        {/* CUÁNDO CAMBIA */}

        <section
          style={{
            marginBottom: "50px",
          }}
        >
          <span className="card-label">
            ¿CUÁNDO CAMBIA EL ELO?
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "32px",
              fontWeight: 400,
              margin: "10px 0 20px",
            }}
          >
            Solamente cuando el resultado queda confirmado
          </h2>

          <p
            style={{
              color: "#aab3ac",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "760px",
            }}
          >
            Uno de los jugadores carga el resultado del partido y
            el rival debe revisarlo.
          </p>

          <p
            style={{
              color: "#aab3ac",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "760px",
            }}
          >
            Si el resultado es correcto, el rival lo confirma. Recién
            entonces el partido se marca como finalizado y se
            actualizan los puntos Elo.
          </p>

          <p
            style={{
              color: "#aab3ac",
              fontSize: "16px",
              lineHeight: "1.8",
              maxWidth: "760px",
            }}
          >
            Si el rival considera que el resultado cargado es
            incorrecto, puede rechazarlo para que vuelva a cargarse.
          </p>
        </section>

        {/* FILOSOFÍA */}

        <section
          style={{
            borderTop: "1px solid #243529",
            borderBottom: "1px solid #243529",
            padding: "36px 0",
            marginBottom: "48px",
          }}
        >
          <span className="card-label">
            ¿QUÉ BUSCA EL SISTEMA?
          </span>

          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "32px",
              fontWeight: 400,
              margin: "10px 0 20px",
            }}
          >
            Que el ranking represente el nivel real de juego
          </h2>

          <p
            style={{
              color: "#c9cdc6",
              fontSize: "17px",
              lineHeight: "1.8",
              maxWidth: "800px",
            }}
          >
            No alcanza simplemente con jugar muchos partidos. Para
            subir tenés que obtener buenos resultados.
          </p>

          <p
            style={{
              color: "#c9cdc6",
              fontSize: "17px",
              lineHeight: "1.8",
              maxWidth: "800px",
            }}
          >
            Con el tiempo, los jugadores con resultados y niveles
            similares deberían terminar cada vez más cerca dentro
            del ranking.
          </p>
        </section>

        {/* RESUMEN */}

        <section>
          <h2
            style={{
              fontFamily: "Georgia, serif",
              fontSize: "30px",
              fontWeight: 400,
              marginTop: 0,
            }}
          >
            En resumen
          </h2>

          <div
            style={{
              display: "grid",
              gap: "14px",
              color: "#c9cdc6",
              lineHeight: "1.7",
            }}
          >
            <div>
              <strong style={{ color: "#9bbe61" }}>
                01.
              </strong>{" "}
              Todos los jugadores comienzan con 1500 Elo.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                02.
              </strong>{" "}
              Los primeros 5 partidos son nivelatorios.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                03.
              </strong>{" "}
              Durante la nivelación el Elo puede cambiar más rápido.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                04.
              </strong>{" "}
              Desde el sexto partido el Elo se vuelve más estable.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                05.
              </strong>{" "}
              Ganar suma puntos y perder resta puntos.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                06.
              </strong>{" "}
              Ganarle a un rival fuerte vale más.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                07.
              </strong>{" "}
              Perder contra un rival fuerte te perjudica menos.
            </div>

            <div>
              <strong style={{ color: "#9bbe61" }}>
                08.
              </strong>{" "}
              El Elo se modifica solamente cuando el rival confirma
              el resultado.
            </div>
          </div>

          <div
            style={{
              marginTop: "38px",
            }}
          >
            <Link
              to="/ranking"
              className="btn-solid"
            >
              VER RANKING →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}