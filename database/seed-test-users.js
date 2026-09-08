import bcrypt from "bcrypt";

import {
  pool,
} from "../src/db.js";

import {
  LEAGUE_CITY,
} from "../src/constants/league.js";


/*
  ============================================================
  USUARIOS QA

  10 Liga Masculina
  10 Liga Femenina

  Contraseña:
  Nombre123

  Ejemplos:
  Lucas123
  Sofia123

  Todos nacen:
  - verificados
  - Elo 0
  - 0 partidos
  - provisionales
  ============================================================
*/

const testUsers = [
  {
    firstName: "Lucas",
    lastName: "Fernandez",
    gender: "male",
    dni: "45000001",
    phone: "3329000001",
  },
  {
    firstName: "Mateo",
    lastName: "Gomez",
    gender: "male",
    dni: "45000002",
    phone: "3329000002",
  },
  {
    firstName: "Tomas",
    lastName: "Rodriguez",
    gender: "male",
    dni: "45000003",
    phone: "3329000003",
  },
  {
    firstName: "Nicolas",
    lastName: "Acosta",
    gender: "male",
    dni: "45000004",
    phone: "3329000004",
  },
  {
    firstName: "Franco",
    lastName: "Romero",
    gender: "male",
    dni: "45000005",
    phone: "3329000005",
  },
  {
    firstName: "Joaquin",
    lastName: "Martinez",
    gender: "male",
    dni: "45000006",
    phone: "3329000006",
  },
  {
    firstName: "Santiago",
    lastName: "Lopez",
    gender: "male",
    dni: "45000007",
    phone: "3329000007",
  },
  {
    firstName: "Agustin",
    lastName: "Perez",
    gender: "male",
    dni: "45000008",
    phone: "3329000008",
  },
  {
    firstName: "Martin",
    lastName: "Benitez",
    gender: "male",
    dni: "45000009",
    phone: "3329000009",
  },
  {
    firstName: "Bruno",
    lastName: "Diaz",
    gender: "male",
    dni: "45000010",
    phone: "3329000010",
  },

  {
    firstName: "Sofia",
    lastName: "Fernandez",
    gender: "female",
    dni: "46000001",
    phone: "3329000011",
  },
  {
    firstName: "Camila",
    lastName: "Gomez",
    gender: "female",
    dni: "46000002",
    phone: "3329000012",
  },
  {
    firstName: "Valentina",
    lastName: "Rodriguez",
    gender: "female",
    dni: "46000003",
    phone: "3329000013",
  },
  {
    firstName: "Lucia",
    lastName: "Acosta",
    gender: "female",
    dni: "46000004",
    phone: "3329000014",
  },
  {
    firstName: "Martina",
    lastName: "Romero",
    gender: "female",
    dni: "46000005",
    phone: "3329000015",
  },
  {
    firstName: "Julieta",
    lastName: "Martinez",
    gender: "female",
    dni: "46000006",
    phone: "3329000016",
  },
  {
    firstName: "Catalina",
    lastName: "Lopez",
    gender: "female",
    dni: "46000007",
    phone: "3329000017",
  },
  {
    firstName: "Micaela",
    lastName: "Perez",
    gender: "female",
    dni: "46000008",
    phone: "3329000018",
  },
  {
    firstName: "Florencia",
    lastName: "Benitez",
    gender: "female",
    dni: "46000009",
    phone: "3329000019",
  },
  {
    firstName: "Victoria",
    lastName: "Diaz",
    gender: "female",
    dni: "46000010",
    phone: "3329000020",
  },
];


/*
  ============================================================
  BORRAR TABLA SI EXISTE

  migration_009 todavía puede no estar
  presente en todas las bases, por eso
  elo_replay_batches se detecta antes.
  ============================================================
*/

const deleteAllIfTableExists =
  async (
    client,
    tableName,
  ) => {
    const exists =
      await client.query(
        `
        SELECT
          to_regclass($1)
            AS table_name
        `,
        [
          `public.${tableName}`,
        ],
      );

    if (
      !exists.rows[0]
        .table_name
    ) {
      return;
    }

    /*
      tableName sale exclusivamente de
      constantes internas de este archivo.
    */

    await client.query(
      `DELETE FROM ${tableName}`,
    );
  };


/*
  ============================================================
  EJECUCIÓN
  ============================================================
*/

const client =
  await pool.connect();

try {
  await client.query(
    "BEGIN",
  );


  /*
    ==========================================================
    LIMPIEZA DE DATOS DEPORTIVOS QA

    Orden importante por Foreign Keys.

    Conservamos:
    - estructura
    - migrations
    - usuarios admin

    Borramos:
    - replay batches
    - flags
    - Elo histórico
    - auditoría
    - partidos
    - desafíos
    - jugadores
    ==========================================================
  */

  await deleteAllIfTableExists(
    client,
    "elo_replay_batches",
  );

  await deleteAllIfTableExists(
    client,
    "match_audit_flags",
  );

  await deleteAllIfTableExists(
    client,
    "elo_events",
  );

  await deleteAllIfTableExists(
    client,
    "audit_events",
  );

  await deleteAllIfTableExists(
    client,
    "matches",
  );

  await deleteAllIfTableExists(
    client,
    "challenges",
  );


  /*
    ==========================================================
    BORRAR SOLO JUGADORES

    El admin permanece intacto.
    ==========================================================
  */

  const deletedPlayers =
    await client.query(
      `
      DELETE FROM users

      WHERE
        role = 'player'

      RETURNING
        id,
        name
      `,
    );


  /*
    ==========================================================
    CREAR 20 JUGADORES
    ==========================================================
  */

  let maleRank = 0;
  let femaleRank = 0;

  const createdUsers = [];

  for (
    const user of
    testUsers
  ) {
    const password =
      `${user.firstName}123`;

    const hashedPassword =
      await bcrypt.hash(
        password,
        10,
      );

    const email =
      `${user.firstName}.${user.lastName}@test.ligatenis.local`
        .toLowerCase();

    const rankPosition =
      user.gender ===
      "male"
        ? ++maleRank
        : ++femaleRank;

    const inserted =
      await client.query(
        `
        INSERT INTO users (
          name,
          first_name,
          last_name,
          dni,
          phone,
          email,
          password,
          city,
          gender,
          role,
          rank_position,
          rating,
          matches_played,
          verification_status,
          verified_at,
          dni_front_path,
          dni_back_path,
          password_reset_token,
          password_reset_expires,
          created_at,
          updated_at
        )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'player',
          $10,
          0,
          0,
          'verified',
          CURRENT_TIMESTAMP,
          NULL,
          NULL,
          NULL,
          NULL,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )

        RETURNING
          id,
          name,
          dni,
          email,
          gender,
          rating,
          matches_played,
          verification_status
        `,
        [
          `${user.firstName} ${user.lastName}`,
          user.firstName,
          user.lastName,
          user.dni,
          user.phone,
          email,
          hashedPassword,
          LEAGUE_CITY,
          user.gender,
          rankPosition,
        ],
      );

    createdUsers.push({
      ...inserted.rows[0],

      password,
    });
  }


  /*
    ==========================================================
    CONTROL INTERNO
    ==========================================================
  */

  if (
    createdUsers.length !==
    20
  ) {
    throw new Error(
      `Se esperaban 20 usuarios y se crearon ${createdUsers.length}.`,
    );
  }

  const maleCount =
    createdUsers.filter(
      (user) =>
        user.gender ===
        "male",
    ).length;

  const femaleCount =
    createdUsers.filter(
      (user) =>
        user.gender ===
        "female",
    ).length;

  if (
    maleCount !== 10 ||
    femaleCount !== 10
  ) {
    throw new Error(
      `Distribución incorrecta: male=${maleCount}, female=${femaleCount}.`,
    );
  }


  await client.query(
    "COMMIT",
  );


  /*
    ==========================================================
    SALIDA
    ==========================================================
  */

  console.log("");
  console.log(
    "========================================",
  );
  console.log(
    "SEED QA COMPLETADO",
  );
  console.log(
    "========================================",
  );

  console.log(
    `Jugadores anteriores eliminados: ${deletedPlayers.rowCount}`,
  );

  console.log(
    "Jugadores nuevos: 20",
  );

  console.log(
    "Liga masculina: 10",
  );

  console.log(
    "Liga femenina: 10",
  );

  console.log("");
  console.log(
    "CREDENCIALES:",
  );
  console.log("");

  for (
    const user of
    createdUsers
  ) {
    console.log(
      `${user.name} | DNI ${user.dni} | ${user.password} | ${user.gender}`,
    );
  }

  console.log("");
  console.log(
    "Todos los jugadores:",
  );
  console.log(
    "- verificados",
  );
  console.log(
    "- Elo 0",
  );
  console.log(
    "- 0 partidos",
  );
  console.log(
    "- provisionales",
  );
  console.log("");
} catch (error) {
  try {
    await client.query(
      "ROLLBACK",
    );
  } catch {
    // La conexión se libera abajo.
  }

  console.error(
    "ERROR EN SEED QA:",
    error,
  );

  process.exitCode = 1;
} finally {
  client.release();

  await pool.end();
}