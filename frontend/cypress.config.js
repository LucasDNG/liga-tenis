import {
  defineConfig,
} from "cypress";


export default defineConfig({
  e2e: {
    baseUrl:
      "http://localhost:5173",

    specPattern:
      "cypress/e2e/**/*.cy.js",

    supportFile:
      "cypress/support/e2e.js",

    video:
      false,

    screenshotOnRunFailure:
      true,

    viewportWidth:
      1280,

    viewportHeight:
      800,

    defaultCommandTimeout:
      10000,

    requestTimeout:
      10000,

    responseTimeout:
      15000,
  },
});