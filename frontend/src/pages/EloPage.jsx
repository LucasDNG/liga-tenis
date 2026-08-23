import { Link } from "react-router-dom";

import "./EloPage.css";

export default function EloPage() {
  return (
    <main className="page-dark elo-page">
      <div className="site-width elo-page-content">
        <div className="page-heading elo-heading">
          <div>
            <span>RANKING DE LA LIGA</span>
            <h1>¿Cómo funciona el Elo?</h1>
          </div>
        </div>

        <section className="elo-intro">
          <p className="elo-intro-lead">
            El sistema Elo es la forma que usamos para medir el nivel competitivo de cada jugador.
          </p>
          <p>
            Todos los jugadores comienzan con <strong>1500 puntos Elo</strong>. A partir de ahí,
            el puntaje cambia según los resultados de los partidos.
          </p>
          <p>
            El objetivo es que, con el paso de los partidos, cada jugador termine ubicado cerca
            de otros jugadores de un nivel similar.
          </p>
        </section>

        <section className="elo-principles-grid">
          <article className="elo-card">
            <span className="elo-label">SI GANÁS</span>
            <h2>Sumás puntos</h2>
            <p>
              Cuando ganás un partido, tu Elo aumenta. Pero no todas las victorias entregan la
              misma cantidad de puntos.
            </p>
          </article>

          <article className="elo-card">
            <span className="elo-label">SI PERDÉS</span>
            <h2>Restás puntos</h2>
            <p>
              Cuando perdés, tu Elo disminuye. La cantidad que perdés también depende del nivel
              que tenía tu rival.
            </p>
          </article>

          <article className="elo-card">
            <span className="elo-label">TU RIVAL IMPORTA</span>
            <h2>No todos los partidos valen igual</h2>
            <p>
              Ganarle a un jugador con más Elo tiene más valor que ganarle a alguien que estaba
              claramente por debajo tuyo.
            </p>
          </article>
        </section>

        <section className="elo-feature">
          <span className="elo-label">CUANDO RECIÉN ENTRÁS A LA LIGA</span>
          <h2>Tus primeros 5 partidos son nivelatorios</h2>
          <p className="elo-feature-lead">
            Cuando un jugador se registra todavía no tenemos suficiente información para saber
            cuál es su nivel real. Por eso todos comienzan en 1500 Elo, pero los primeros cinco
            partidos tienen una importancia especial.
          </p>
          <p>
            Durante esos primeros encuentros, el Elo puede subir o bajar más rápido. Esto permite
            que el sistema encuentre antes una posición adecuada para cada jugador.
          </p>

          <div className="elo-mini-grid">
            <div className="elo-mini-card">
              <span>PARTIDOS 1 A 5</span>
              <h3>Elo más sensible</h3>
              <p>
                Las victorias y derrotas producen movimientos más grandes para ayudar a encontrar
                rápidamente tu nivel.
              </p>
            </div>

            <div className="elo-mini-card">
              <span>DESDE EL PARTIDO 6</span>
              <h3>Elo estable</h3>
              <p>
                Una vez terminada la etapa nivelatoria, los cambios pasan a ser más moderados y
                el ranking se vuelve más estable.
              </p>
            </div>
          </div>

          <p className="elo-feature-bottom">
            Esto no significa que un jugador nuevo tenga ventaja. El objetivo es simplemente{" "}
            <strong>ubicarlo más rápido en una zona acorde a su nivel</strong>.
          </p>
        </section>

        <section className="elo-section">
          <span className="elo-label">UN EJEMPLO SIMPLE</span>
          <h2>Dos jugadores con el mismo nivel</h2>
          <p>Supongamos que ambos jugadores ya terminaron sus cinco partidos nivelatorios.</p>

          <div className="elo-example-grid">
            <div className="elo-example-card">
              <span>ANTES DEL PARTIDO</span>
              <p>Marcos <strong>1500 Elo</strong></p>
              <p>Lucas <strong>1500 Elo</strong></p>
            </div>

            <div className="elo-example-card accent">
              <span>SI MARCOS GANA</span>
              <p>Marcos <strong>1516 Elo</strong></p>
              <p>Lucas <strong className="elo-loss">1484 Elo</strong></p>
            </div>
          </div>

          <p className="elo-small-note">
            Durante los cinco partidos nivelatorios, el movimiento puede ser mayor porque el
            sistema todavía está tratando de determinar el nivel real del jugador.
          </p>
        </section>

        <section className="elo-section">
          <span className="elo-label">LA PARTE MÁS IMPORTANTE</span>
          <h2>Ganarle a alguien mejor vale más</h2>
          <p>
            Supongamos que un jugador tiene 1400 Elo y enfrenta a otro que tiene 1600. El jugador
            de 1600 llega como favorito.
          </p>
          <p>
            Si gana el jugador de 1600, el sistema considera que ocurrió algo bastante esperable.
            Por eso gana pocos puntos.
          </p>
          <p className="elo-emphasis">
            Pero si el jugador de <strong>1400 le gana al de 1600</strong>, consiguió un resultado
            mucho más difícil y recibe una cantidad mayor de puntos Elo.
          </p>
        </section>

        <section className="elo-feature elo-reverse">
          <span className="elo-label">TAMBIÉN FUNCIONA AL REVÉS</span>
          <h2>Perder contra un jugador fuerte te perjudica menos</h2>
          <p>
            Si enfrentás a alguien que tiene bastante más Elo que vos y perdés, el sistema entiende
            que era un resultado probable. Por eso la pérdida de puntos es menor.
          </p>
          <p>
            En cambio, si perdés frente a un jugador que tenía bastante menos Elo, la caída es
            mayor porque el resultado fue inesperado.
          </p>
        </section>

        <section className="elo-section">
          <span className="elo-label">¿CUÁNDO CAMBIA EL ELO?</span>
          <h2>Solamente cuando el resultado queda confirmado</h2>
          <p>
            Uno de los jugadores carga el resultado del partido y el rival debe revisarlo.
          </p>
          <p>
            Si el resultado es correcto, el rival lo confirma. Recién entonces el partido se marca
            como finalizado y se actualizan los puntos Elo.
          </p>
          <p>
            Si el rival considera que el resultado cargado es incorrecto, puede rechazarlo para que
            vuelva a cargarse.
          </p>
        </section>

        <section className="elo-section elo-philosophy">
          <span className="elo-label">¿QUÉ BUSCA EL SISTEMA?</span>
          <h2>Que el ranking represente el nivel real de juego</h2>
          <p className="elo-emphasis">
            No alcanza simplemente con jugar muchos partidos. Para subir tenés que obtener buenos resultados.
          </p>
          <p className="elo-emphasis">
            Con el tiempo, los jugadores con resultados y niveles similares deberían terminar cada
            vez más cerca dentro del ranking.
          </p>
        </section>

        <section className="elo-summary">
          <h2>En resumen</h2>

          <div className="elo-summary-list">
            <div><strong>01.</strong><span>Todos los jugadores comienzan con 1500 Elo.</span></div>
            <div><strong>02.</strong><span>Los primeros 5 partidos son nivelatorios.</span></div>
            <div><strong>03.</strong><span>Durante la nivelación el Elo puede cambiar más rápido.</span></div>
            <div><strong>04.</strong><span>Desde el sexto partido el Elo se vuelve más estable.</span></div>
            <div><strong>05.</strong><span>Ganar suma puntos y perder resta puntos.</span></div>
            <div><strong>06.</strong><span>Ganarle a un rival fuerte vale más.</span></div>
            <div><strong>07.</strong><span>Perder contra un rival fuerte te perjudica menos.</span></div>
            <div><strong>08.</strong><span>El Elo se modifica solamente cuando el rival confirma el resultado.</span></div>
          </div>

          <div className="elo-ranking-link">
            <Link to="/ranking" className="btn-solid">
              VER RANKING →
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}