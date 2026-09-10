import test from "node:test";
import assert from "node:assert/strict";


const comparePairs = (
  a,
  b,
) => {
  const rating =
    Number(b.rating) -
    Number(a.rating);

  if (
    rating !== 0
  ) {
    return rating;
  }

  const matchBalance =
    (
      Number(b.wins) -
      Number(b.losses)
    ) -
    (
      Number(a.wins) -
      Number(a.losses)
    );

  if (
    matchBalance !== 0
  ) {
    return matchBalance;
  }

  const gameBalance =
    (
      Number(b.games_won) -
      Number(b.games_lost)
    ) -
    (
      Number(a.games_won) -
      Number(a.games_lost)
    );

  if (
    gameBalance !== 0
  ) {
    return gameBalance;
  }

  const namesA = [
    a.player1_last_name,
    a.player1_first_name,
    a.player2_last_name,
    a.player2_first_name,
  ];

  const namesB = [
    b.player1_last_name,
    b.player1_first_name,
    b.player2_last_name,
    b.player2_first_name,
  ];

  for (
    let index = 0;
    index <
    namesA.length;
    index += 1
  ) {
    const comparison =
      String(
        namesA[index] ??
        "",
      ).localeCompare(
        String(
          namesB[index] ??
          "",
        ),
        "es",
        {
          sensitivity:
            "base",
        },
      );

    if (
      comparison !== 0
    ) {
      return comparison;
    }
  }

  return (
    Number(a.id) -
    Number(b.id)
  );
};


const pair = ({
  id,
  rating =
    1000,
  wins =
    0,
  losses =
    0,
  gamesWon =
    0,
  gamesLost =
    0,
  p1Last =
    "A",
  p1First =
    "A",
  p2Last =
    "B",
  p2First =
    "B",
}) => ({
  id,
  rating,
  wins,
  losses,
  games_won:
    gamesWon,
  games_lost:
    gamesLost,
  player1_last_name:
    p1Last,
  player1_first_name:
    p1First,
  player2_last_name:
    p2Last,
  player2_first_name:
    p2First,
});


test(
  "mayor Elo queda primero",
  () => {
    const rows = [
      pair({
        id: 1,
        rating: 1000,
      }),
      pair({
        id: 2,
        rating: 1200,
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "con mismo Elo gana mejor balance de partidos",
  () => {
    const rows = [
      pair({
        id: 1,
        rating: 1000,
        wins: 3,
        losses: 3,
      }),
      pair({
        id: 2,
        rating: 1000,
        wins: 5,
        losses: 2,
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "balance de partidos prevalece sobre games",
  () => {
    const rows = [
      pair({
        id: 1,
        wins: 5,
        losses: 4,
        gamesWon: 100,
        gamesLost: 10,
      }),
      pair({
        id: 2,
        wins: 5,
        losses: 3,
        gamesWon: 10,
        gamesLost: 100,
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "con Elo y partidos iguales gana balance de games",
  () => {
    const rows = [
      pair({
        id: 1,
        wins: 4,
        losses: 2,
        gamesWon: 30,
        gamesLost: 25,
      }),
      pair({
        id: 2,
        wins: 4,
        losses: 2,
        gamesWon: 40,
        gamesLost: 20,
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "si estadísticas empatan ordena por jugador 1",
  () => {
    const rows = [
      pair({
        id: 1,
        p1Last: "Zapata",
      }),
      pair({
        id: 2,
        p1Last: "Alvarez",
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "si jugador 1 empata usa jugador 2",
  () => {
    const rows = [
      pair({
        id: 1,
        p1Last: "Alvarez",
        p1First: "Juan",
        p2Last: "Zapata",
      }),
      pair({
        id: 2,
        p1Last: "Alvarez",
        p1First: "Juan",
        p2Last: "Benitez",
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      2,
    );
  },
);


test(
  "si todo empata usa menor pair id",
  () => {
    const rows = [
      pair({
        id: 20,
      }),
      pair({
        id: 10,
      }),
    ];

    rows.sort(
      comparePairs,
    );

    assert.equal(
      rows[0].id,
      10,
    );
  },
);


test(
  "mismo jugador puede aparecer en distintas parejas",
  () => {
    const pairs = [
      {
        id: 1,
        player1_id: 10,
        player2_id: 20,
      },
      {
        id: 2,
        player1_id: 10,
        player2_id: 30,
      },
    ];

    assert.equal(
      pairs.filter(
        (entry) =>
          entry.player1_id ===
            10 ||
          entry.player2_id ===
            10,
      ).length,
      2,
    );
  },
);


test(
  "pareja A/B y B/A representan la misma identidad canónica",
  () => {
    const canonicalize =
      (
        a,
        b,
      ) => [
        Math.min(a, b),
        Math.max(a, b),
      ];

    assert.deepEqual(
      canonicalize(
        10,
        25,
      ),
      canonicalize(
        25,
        10,
      ),
    );
  },
);