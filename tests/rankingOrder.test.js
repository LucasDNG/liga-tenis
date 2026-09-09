import test from "node:test";
import assert from "node:assert/strict";

import {
  compareRankingPlayers,
  formatRankingPlayerName,
} from "../src/services/rankingOrder.service.js";


/*
  ============================================================
  LA RED
  TESTS DEL ORDEN CENTRAL DEL RANKING
  ============================================================

  REGLA FINAL DE DESEMPATE:

  1. mayor Elo
  2. mayor balance de partidos:
       wins - losses
  3. mayor balance de games:
       games_won - games_lost
  4. apellido alfabético
  5. nombre alfabético
  6. menor ID

  No intervienen:
  - matches_played
  - fecha de registro
  - edad
  - fecha del último partido
  ============================================================
*/


const player = ({
  id,
  firstName,
  lastName,
  rating = 1500,
  wins = 0,
  losses = 0,
  gamesWon = 0,
  gamesLost = 0,
  matchesPlayed = 5,
}) => ({
  id,

  name:
    `${firstName} ${lastName}`,

  first_name:
    firstName,

  last_name:
    lastName,

  rating,

  wins,

  losses,

  match_balance:
    wins - losses,

  games_won:
    gamesWon,

  games_lost:
    gamesLost,

  game_balance:
    gamesWon -
    gamesLost,

  matches_played:
    matchesPlayed,
});


const sortPlayers = (
  players,
) =>
  [...players].sort(
    compareRankingPlayers,
  );


test(
  "mayor Elo queda primero",
  () => {
    const lower =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
      });

    const higher =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1600,
      });

    const ordered =
      sortPlayers([
        lower,
        higher,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );

    assert.equal(
      ordered[1].id,
      1,
    );
  },
);


test(
  "con mismo Elo gana el mejor balance de partidos",
  () => {
    const worseBalance =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 4,
      });

    const betterBalance =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 6,
        losses: 3,
      });

    const ordered =
      sortPlayers([
        worseBalance,
        betterBalance,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "balance de partidos usa wins - losses",
  () => {
    const playerA =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 8,
        losses: 7,
      });

    const playerB =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 4,
        losses: 1,
      });

    /*
      A:
      8 - 7 = +1

      B:
      4 - 1 = +3

      Debe ganar B aunque tenga
      menos victorias absolutas.
    */

    const ordered =
      sortPlayers([
        playerA,
        playerB,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "con mismo Elo y balance de partidos gana el balance de games",
  () => {
    const worseGames =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 48,
      });

    const betterGames =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 60,
        gamesLost: 50,
      });

    const ordered =
      sortPlayers([
        worseGames,
        betterGames,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "balance de games usa games_won - games_lost",
  () => {
    const playerA =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 80,
        gamesLost: 75,
      });

    const playerB =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    /*
      A:
      80 - 75 = +5

      B:
      50 - 40 = +10

      Debe ganar B.
    */

    const ordered =
      sortPlayers([
        playerA,
        playerB,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "si Elo y balances empatan ordena por apellido",
  () => {
    const zeta =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Zárate",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const alpha =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Álvarez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const ordered =
      sortPlayers([
        zeta,
        alpha,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "si apellido también empata ordena por nombre",
  () => {
    const lucas =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const agustin =
      player({
        id: 2,
        firstName: "Agustín",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const ordered =
      sortPlayers([
        lucas,
        agustin,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "si absolutamente todo empata gana el menor ID",
  () => {
    const higherId =
      player({
        id: 20,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const lowerId =
      player({
        id: 10,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const ordered =
      sortPlayers([
        higherId,
        lowerId,
      ]);

    assert.equal(
      ordered[0].id,
      10,
    );

    assert.equal(
      ordered[1].id,
      20,
    );
  },
);


test(
  "matches_played no rompe un empate",
  () => {
    const manyMatches =
      player({
        id: 20,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
        matchesPlayed: 100,
      });

    const fewMatches =
      player({
        id: 10,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
        matchesPlayed: 5,
      });

    /*
      Todo lo deportivo empata.

      matches_played NO debe decidir.

      El siguiente desempate válido
      es el ID.
    */

    const ordered =
      sortPlayers([
        manyMatches,
        fewMatches,
      ]);

    assert.equal(
      ordered[0].id,
      10,
    );
  },
);


test(
  "un Elo mayor prevalece aunque tenga peor balance deportivo",
  () => {
    const higherElo =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1501,
        wins: 1,
        losses: 10,
        gamesWon: 10,
        gamesLost: 100,
      });

    const lowerElo =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 20,
        losses: 0,
        gamesWon: 200,
        gamesLost: 0,
      });

    const ordered =
      sortPlayers([
        lowerElo,
        higherElo,
      ]);

    assert.equal(
      ordered[0].id,
      1,
    );
  },
);


test(
  "balance de partidos prevalece sobre balance de games",
  () => {
    const betterMatches =
      player({
        id: 1,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 6,
        losses: 2,
        gamesWon: 20,
        gamesLost: 100,
      });

    const betterGames =
      player({
        id: 2,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 200,
        gamesLost: 0,
      });

    /*
      Match balance:

      Lucas:
      6 - 2 = +4

      Mateo:
      5 - 3 = +2

      Lucas debe quedar arriba,
      aunque Mateo tenga un balance
      de games muchísimo mejor.
    */

    const ordered =
      sortPlayers([
        betterGames,
        betterMatches,
      ]);

    assert.equal(
      ordered[0].id,
      1,
    );
  },
);


test(
  "balance de games prevalece sobre orden alfabético",
  () => {
    const alphabeticallyFirst =
      player({
        id: 1,
        firstName: "Agustín",
        lastName: "Álvarez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 40,
        gamesLost: 39,
      });

    const betterGames =
      player({
        id: 2,
        firstName: "Zoe",
        lastName: "Zárate",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      });

    const ordered =
      sortPlayers([
        alphabeticallyFirst,
        betterGames,
      ]);

    assert.equal(
      ordered[0].id,
      2,
    );
  },
);


test(
  "ranking completo respeta toda la cadena de desempate",
  () => {
    const players = [
      player({
        id: 8,
        firstName: "Lucas",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      }),

      player({
        id: 7,
        firstName: "Agustín",
        lastName: "Fernández",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 50,
        gamesLost: 40,
      }),

      player({
        id: 6,
        firstName: "Mateo",
        lastName: "Gómez",
        rating: 1500,
        wins: 5,
        losses: 3,
        gamesWon: 60,
        gamesLost: 40,
      }),

      player({
        id: 5,
        firstName: "Pedro",
        lastName: "Pérez",
        rating: 1500,
        wins: 6,
        losses: 2,
        gamesWon: 20,
        gamesLost: 100,
      }),

      player({
        id: 4,
        firstName: "Tomás",
        lastName: "Ruiz",
        rating: 1600,
        wins: 0,
        losses: 10,
        gamesWon: 0,
        gamesLost: 100,
      }),
    ];

    const ordered =
      sortPlayers(
        players,
      );

    assert.deepEqual(
      ordered.map(
        (item) =>
          item.id,
      ),
      [
        /*
          #1:
          mayor Elo
        */
        4,

        /*
          mismo 1500:
          mejor match balance
        */
        5,

        /*
          mismo match balance:
          mejor game balance
        */
        6,

        /*
          mismo todo restante:
          Fernández Agustín
          antes que
          Fernández Lucas
        */
        7,
        8,
      ],
    );
  },
);


test(
  "formatRankingPlayerName muestra apellido primero",
  () => {
    const result =
      formatRankingPlayerName({
        id: 1,
        first_name:
          "Lucas",
        last_name:
          "Fernández",
        name:
          "Lucas Fernández",
      });

    assert.equal(
      result,
      "Fernández Lucas",
    );
  },
);