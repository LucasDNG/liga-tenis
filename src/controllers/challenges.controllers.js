import { pool } from "../db.js";

const getRankedPlayer = async (
  client,
  id,
) => {
  const result =
    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,
          name,
          phone,
          city,
          gender,
          rating,
          verification_status,

          ROW_NUMBER() OVER (
            PARTITION BY city, gender
            ORDER BY
              rating DESC,
              matches_played DESC,
              id ASC
          )::int AS rank_position

        FROM users

        WHERE gender IS NOT NULL
      )

      SELECT *
      FROM ranked
      WHERE id = $1
      `,
      [id],
    );

  return result.rows[0];
};

export const createChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    const challengerId =
      req.userId;

    const challengedId =
      Number(
        req.body.challenged_id,
      );

    if (
      !challengedId ||
      challengedId ===
        challengerId
    ) {
      return res
        .status(400)
        .json({
          message:
            "Rival inválido",
        });
    }

    await client.query(
      "BEGIN",
    );

    const challenger =
      await getRankedPlayer(
        client,
        challengerId,
      );

    const challenged =
      await getRankedPlayer(
        client,
        challengedId,
      );

    if (
      !challenger ||
      !challenged
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }

    /*
      VERIFICACIÓN DEL JUGADOR
      QUE CREA EL DESAFÍO
    */

    if (
      challenger.verification_status !==
      "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      if (
        challenger.verification_status ===
        "rejected"
      ) {
        return res
          .status(403)
          .json({
            message:
              "Tu documentación fue rechazada. No podés crear desafíos hasta volver a verificar tu identidad.",
          });
      }

      return res
        .status(403)
        .json({
          message:
            "Tu identidad todavía está pendiente de verificación. Vas a poder desafiar cuando tu cuenta sea aprobada.",
        });
    }

    /*
      TAMBIÉN EVITAMOS DESAFIAR
      A UN JUGADOR NO VERIFICADO
    */

    if (
      challenged.verification_status !==
      "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Ese jugador todavía no está habilitado para competir.",
        });
    }

    if (
      !challenger.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Primero elegí tu Liga Masculina o Femenina en Mi perfil",
        });
    }

    if (
      challenger.gender !==
      challenged.gender
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Solo podés desafiar jugadores de tu misma liga",
        });
    }

    const difference =
      challenger.rank_position -
      challenged.rank_position;

    if (
      difference < 1 ||
      difference > 3
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "Solo podés desafiar hasta 3 posiciones por encima",
        });
    }

    const active =
      await client.query(
        `
        SELECT id
        FROM challenges
        WHERE status = 'pending'
          AND (
            (
              challenger_id = $1
              AND challenged_id = $2
            )
            OR
            (
              challenger_id = $2
              AND challenged_id = $1
            )
          )
        `,
        [
          challengerId,
          challengedId,
        ],
      );

    if (active.rowCount) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(409)
        .json({
          message:
            "Ya existe un desafío pendiente entre estos jugadores",
        });
    }

    const created =
      await client.query(
        `
        INSERT INTO challenges (
          challenger_id,
          challenged_id,
          status
        )
        VALUES (
          $1,
          $2,
          'pending'
        )
        RETURNING *
        `,
        [
          challengerId,
          challengedId,
        ],
      );

    await client.query(
      "COMMIT",
    );

    res
      .status(201)
      .json({
        message:
          "Desafío creado correctamente",

        challenge:
          created.rows[0],
      });
  } catch (error) {
    await client.query(
      "ROLLBACK",
    );

    next(error);
  } finally {
    client.release();
  }
};

export const getMyChallenges = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(
        `
        SELECT
          c.*,

          u1.name AS
            challenger_name,

          u2.name AS
            challenged_name,

          u1.phone AS
            challenger_phone,

          u2.phone AS
            challenged_phone

        FROM challenges c

        JOIN users u1
          ON u1.id =
             c.challenger_id

        JOIN users u2
          ON u2.id =
             c.challenged_id

        WHERE
          c.challenger_id = $1
          OR
          c.challenged_id = $1

        ORDER BY
          c.created_at DESC
        `,
        [
          req.userId,
        ],
      );

    res.json({
      challenges:
        result.rows,
    });
  } catch (error) {
    next(error);
  }
};

export const acceptChallenge = async (
  req,
  res,
  next,
) => {
  const client =
    await pool.connect();

  try {
    await client.query(
      "BEGIN",
    );

    /*
      Antes de aceptar también
      comprobamos que el jugador
      siga habilitado.
    */

    const currentUser =
      await client.query(
        `
        SELECT
          verification_status
        FROM users
        WHERE id = $1
        `,
        [
          req.userId,
        ],
      );

    if (
      !currentUser.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Jugador no encontrado",
        });
    }

    if (
      currentUser.rows[0]
        .verification_status !==
      "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(403)
        .json({
          message:
            "Tu cuenta debe estar verificada para aceptar desafíos.",
        });
    }

    const challenge =
      await client.query(
        `
        SELECT *
        FROM challenges

        WHERE id = $1
          AND challenged_id = $2
          AND status = 'pending'

        FOR UPDATE
        `,
        [
          req.params.id,
          req.userId,
        ],
      );

    if (
      !challenge.rowCount
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(404)
        .json({
          message:
            "Desafío pendiente no encontrado",
        });
    }

    const c =
      challenge.rows[0];

    /*
      Comprobamos también que
      quien creó el desafío siga
      verificado.
    */

    const challenger =
      await client.query(
        `
        SELECT
          verification_status
        FROM users
        WHERE id = $1
        `,
        [
          c.challenger_id,
        ],
      );

    if (
      !challenger.rowCount ||
      challenger.rows[0]
        .verification_status !==
        "verified"
    ) {
      await client.query(
        "ROLLBACK",
      );

      return res
        .status(400)
        .json({
          message:
            "El jugador que creó este desafío ya no está habilitado para competir.",
        });
    }

    await client.query(
      `
      UPDATE challenges
      SET status = 'accepted'
      WHERE id = $1
      `,
      [
        c.id,
      ],
    );

    const match =
      await client.query(
        `
        INSERT INTO matches (
          challenge_id,
          player1_id,
          player2_id,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          'pending'
        )
        RETURNING *
        `,
        [
          c.id,
          c.challenger_id,
          c.challenged_id,
        ],
      );

    await client.query(
      "COMMIT",
    );

    res.json({
      message:
        "Desafío aceptado. Partido creado.",

      match:
        match.rows[0],
    });
  } catch (error) {
    await client.query(
      "ROLLBACK",
    );

    next(error);
  } finally {
    client.release();
  }
};

export const rejectChallenge = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(
        `
        UPDATE challenges

        SET status = 'rejected'

        WHERE id = $1
          AND challenged_id = $2
          AND status = 'pending'

        RETURNING *
        `,
        [
          req.params.id,
          req.userId,
        ],
      );

    if (
      !result.rowCount
    ) {
      return res
        .status(404)
        .json({
          message:
            "Desafío pendiente no encontrado",
        });
    }

    res.json({
      message:
        "Desafío rechazado",
    });
  } catch (error) {
    next(error);
  }
};