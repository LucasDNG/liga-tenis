describe(
  "LA RED - smoke test",
  () => {
    it(
      "abre la aplicación",
      () => {
        cy.visit(
          "/",
        );

        cy.contains(
          /LA RED/i,
        ).should(
          "exist",
        );
      },
    );


    it(
      "la aplicación responde en mobile",
      () => {
        cy.viewport(
          390,
          844,
        );

        cy.visit(
          "/",
        );

        cy.contains(
          /LA RED/i,
        ).should(
          "exist",
        );

        cy.get(
          "body",
        ).should(
          "be.visible",
        );
      },
    );
  },
);