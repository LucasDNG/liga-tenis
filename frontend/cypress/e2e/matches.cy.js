describe(
  "LA RED - partidos",
  () => {
    const mockUser = {
      id:
        10,

      name:
        "Lucas Test",

      first_name:
        "Lucas",

      last_name:
        "Test",

      role:
        "player",

      verification_status:
        "verified",

      rating:
        0,

      matches_played:
        2,

      city:
        "San Pedro",

      gender:
        "masculino",
    };


    beforeEach(
      () => {
        /*
          La prueba intercepta los endpoints
          deportivos para no tocar Neon producción.
        */

        cy.intercept(
          "GET",
          "**/matches",
          {
            statusCode:
              200,

            body: {
              matches: [
                {
                  id:
                    100,

                  player1_id:
                    10,

                  player2_id:
                    20,

                  player1_name:
                    "Lucas Test",

                  player2_name:
                    "Rival Test",

                  player1_phone:
                    "3329000000",

                  player2_phone:
                    "3329111111",

                  status:
                    "pending",

                  venue:
                    "Club Test",

                  scheduled_at:
                    "2020-01-01T18:00:00.000Z",

                  cancellation_requested_at:
                    null,

                  cancellation_requested_by:
                    null,

                  cancellation_type:
                    null,

                  cancellation_elo_penalty:
                    null,

                  annulled_at:
                    null,
                },
              ],
            },
          },
        ).as(
          "getMatches",
        );
      },
    );


    it(
      "renderiza partido pendiente",
      () => {
        /*
          Este test supone que el mecanismo actual
          de sesión de desarrollo permite entrar
          a /matches con usuario autenticado.

          Si la app redirige a login, el siguiente
          bloque se reemplaza después por login real.
        */

        cy.visit(
          "/matches",
          {
            onBeforeLoad(
              win,
            ) {
              win.localStorage.setItem(
                "user",
                JSON.stringify(
                  mockUser,
                ),
              );
            },
          },
        );

        cy.wait(
          "@getMatches",
        );

        cy.contains(
          "Rival Test",
        ).should(
          "exist",
        );

        cy.contains(
          "Club Test",
        ).should(
          "exist",
        );

        cy.contains(
          /Enviar resultado/i,
        ).should(
          "exist",
        );

        cy.contains(
          /Cancelar unilateralmente/i,
        ).should(
          "exist",
        );
      },
    );


    it(
      "carga tercer set automáticamente cuando queda 1-1",
      () => {
        cy.visit(
          "/matches",
          {
            onBeforeLoad(
              win,
            ) {
              win.localStorage.setItem(
                "user",
                JSON.stringify(
                  mockUser,
                ),
              );
            },
          },
        );

        cy.wait(
          "@getMatches",
        );

        cy.get(
          ".match-score-editor input",
        )
          .eq(0)
          .clear()
          .type(
            "6",
          );

        cy.get(
          ".match-score-editor input",
        )
          .eq(1)
          .clear()
          .type(
            "4",
          );

        cy.get(
          ".match-score-editor input",
        )
          .eq(2)
          .clear()
          .type(
            "4",
          );

        cy.get(
          ".match-score-editor input",
        )
          .eq(3)
          .clear()
          .type(
            "6",
          );

        cy.contains(
          /tercer set/i,
        ).should(
          "exist",
        );

        cy.get(
          ".match-score-editor input",
        ).should(
          "have.length",
          6,
        );
      },
    );


    it(
      "muestra cancelación unilateral con penalización efectiva",
      () => {
        cy.intercept(
          "GET",
          "**/matches",
          {
            statusCode:
              200,

            body: {
              matches: [
                {
                  id:
                    101,

                  player1_id:
                    10,

                  player2_id:
                    20,

                  player1_name:
                    "Lucas Test",

                  player2_name:
                    "Rival Test",

                  status:
                    "cancelled",

                  cancellation_type:
                    "unilateral",

                  cancellation_elo_penalty:
                    15,

                  cancel_reason:
                    "No puedo jugar",

                  cancelled_at:
                    "2026-01-01T12:00:00.000Z",

                  annulled_at:
                    null,
                },
              ],
            },
          },
        ).as(
          "getCancelledMatch",
        );

        cy.visit(
          "/matches",
          {
            onBeforeLoad(
              win,
            ) {
              win.localStorage.setItem(
                "user",
                JSON.stringify(
                  mockUser,
                ),
              );
            },
          },
        );

        cy.wait(
          "@getCancelledMatch",
        );

        cy.contains(
          /Cancelado unilateralmente/i,
        ).should(
          "exist",
        );

        cy.contains(
          "-15 Elo",
        ).should(
          "exist",
        );
      },
    );


    it(
      "no muestra -0 Elo cuando el jugador estaba en el piso",
      () => {
        cy.intercept(
          "GET",
          "**/matches",
          {
            statusCode:
              200,

            body: {
              matches: [
                {
                  id:
                    102,

                  player1_id:
                    10,

                  player2_id:
                    20,

                  player1_name:
                    "Lucas Test",

                  player2_name:
                    "Rival Test",

                  status:
                    "cancelled",

                  cancellation_type:
                    "unilateral",

                  cancellation_elo_penalty:
                    0,

                  cancel_reason:
                    "No puedo jugar",

                  cancelled_at:
                    "2026-01-01T12:00:00.000Z",

                  annulled_at:
                    null,
                },
              ],
            },
          },
        ).as(
          "getFloorCancellation",
        );

        cy.visit(
          "/matches",
          {
            onBeforeLoad(
              win,
            ) {
              win.localStorage.setItem(
                "user",
                JSON.stringify(
                  mockUser,
                ),
              );
            },
          },
        );

        cy.wait(
          "@getFloorCancellation",
        );

        cy.contains(
          "0 Elo",
        ).should(
          "exist",
        );

        cy.contains(
          "-0 Elo",
        ).should(
          "not.exist",
        );

        cy.contains(
          /piso Elo alcanzado/i,
        ).should(
          "exist",
        );
      },
    );
  },
);