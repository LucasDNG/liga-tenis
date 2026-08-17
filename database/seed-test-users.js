import bcrypt from "bcrypt";
import { pool } from "../src/db.js";
import { LEAGUE_CITY } from "../src/constants/league.js";

const users = [
  ["Marcos","Fernandez","male",1650,"41000001","3329000001"],
  ["Nicolas","Gomez","male",1600,"41000002","3329000002"],
  ["Franco","Rodriguez","male",1550,"41000003","3329000003"],
  ["Tomas","Acosta","male",1500,"41000004","3329000004"],
  ["Joaquin","Romero","male",1450,"41000005","3329000005"],
  ["Sofia","Martinez","female",1640,"42000001","3329000011"],
  ["Camila","Lopez","female",1580,"42000002","3329000012"],
  ["Valentina","Perez","female",1530,"42000003","3329000013"],
  ["Lucia","Benitez","female",1480,"42000004","3329000014"],
  ["Martina","Diaz","female",1430,"42000005","3329000015"],
];

const client = await pool.connect();

try {
  await client.query("BEGIN");

  for (const [first,last,gender,rating,dni,phone] of users) {
    const password = `${first}123`;
    const hash = await bcrypt.hash(password, 10);
    const email = `${first}.${last}@test.com`.toLowerCase();

    const rank = await client.query(
      `
      SELECT COALESCE(MAX(rank_position),0) + 1 AS next
      FROM users
      WHERE city = $1 AND gender = $2
      `,
      [LEAGUE_CITY, gender],
    );

    await client.query(
      `
      INSERT INTO users (
        name,first_name,last_name,dni,phone,email,password,city,gender,
        rank_position,rating,matches_played,verification_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,'pending_verification')
      ON CONFLICT (dni) DO NOTHING
      `,
      [
        `${first} ${last}`, first, last, dni, phone, email, hash,
        LEAGUE_CITY, gender, rank.rows[0].next, rating,
      ],
    );
  }

  await client.query("COMMIT");
  console.log("Usuarios de prueba creados.");
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
} finally {
  client.release();
  await pool.end();
}
