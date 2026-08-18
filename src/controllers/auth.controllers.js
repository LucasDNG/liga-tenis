import bcrypt from "bcrypt";
import crypto from "crypto";

import { pool } from "../db.js";
import { createAccessToken } from "../libs/jwt.js";

import {
  LEAGUE_CITY,
  LEAGUES,
} from "../constants/league.js";

import {
  titleCase,
  toPublicUser,
} from "../utils/user.js";

import {
  sendPasswordResetEmail,
} from "../services/email.service.js";

import {
  uploadDniImages,
} from "../services/cloudinary.service.js";

/*
  CONFIGURACIÓN DE LA COOKIE
*/

const cookieOptions = {
  httpOnly: true,

  secure:
    process.env.NODE_ENV === "production",

  sameSite:
    process.env.NODE_ENV === "production"
      ? "none"
      : "lax",

  maxAge:
    1000 * 60 * 60 * 24,
};

/*
  REGISTRO
*/

export const signUp = async (
  req,
  res,
  next,
) => {
  try {
    const {
      first_name,
      last_name,
      dni,
      phone,
      email,
      password,
      gender,
    } = req.body;

    if (
      !first_name ||
      !last_name ||
      !dni ||
      !phone ||
      !email ||
      !password
    ) {
      return res.status(400).json({
        message:
          "Completá todos los campos",
      });
    }

    if (
      !LEAGUES.includes(gender)
    ) {
      return res.status(400).json({
        message:
          "Elegí Liga Masculina o Liga Femenina",
      });
    }

    if (
      !req.files?.dni_front?.[0] ||
      !req.files?.dni_back?.[0]
    ) {
      return res.status(400).json({
        message:
          "Debés subir frente y dorso del DNI",
      });
    }

    const first =
      titleCase(first_name);

    const last =
      titleCase(last_name);

    const name =
      `${first} ${last}`;

    const normalizedDni =
      dni.trim();

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    /*
      Primero comprobamos que DNI
      y email no estén registrados.

      Esto evita subir imágenes a
      Cloudinary innecesariamente.
    */

    const existing =
      await pool.query(
        `
        SELECT
          dni,
          email
        FROM users
        WHERE dni = $1
           OR email = $2
        `,
        [
          normalizedDni,
          normalizedEmail,
        ],
      );

    if (existing.rowCount) {
      const dniExists =
        existing.rows.some(
          (user) =>
            user.dni ===
            normalizedDni,
        );

      return res
        .status(400)
        .json({
          message:
            dniExists
              ? "Ese DNI ya está registrado"
              : "Ese email ya está registrado",
        });
    }

    /*
      Subimos frente y dorso del DNI
      a Cloudinary.

      Se almacenan como archivos
      authenticated, no públicos.
    */

    const uploadedDni =
      await uploadDniImages({
        frontBuffer:
          req.files
            .dni_front[0]
            .buffer,

        backBuffer:
          req.files
            .dni_back[0]
            .buffer,

        userReference:
          normalizedDni,
      });

    /*
      Guardamos los public_id.

      No guardamos una URL pública
      porque las imágenes son privadas.
    */

    const dniFrontPath =
      uploadedDni.front.public_id;

    const dniBackPath =
      uploadedDni.back.public_id;

    const hashedPassword =
      await bcrypt.hash(
        password,
        10,
      );

    const result =
      await pool.query(
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
          rank_position,
          rating,
          matches_played,
          dni_front_path,
          dni_back_path,
          verification_status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::varchar,
          $9::varchar,

          COALESCE(
            (
              SELECT MAX(rank_position)
              FROM users
              WHERE city = $8::varchar
                AND gender = $9::varchar
            ),
            0
          ) + 1,

          1500,
          0,
          $10,
          $11,
          'pending_verification'
        )
        RETURNING *
        `,
        [
          name,
          first,
          last,
          normalizedDni,
          phone.trim(),
          normalizedEmail,
          hashedPassword,
          LEAGUE_CITY,
          gender,
          dniFrontPath,
          dniBackPath,
        ],
      );

    const user =
      toPublicUser(
        result.rows[0],
      );

    const token =
      await createAccessToken({
        id: user.id,
      });

    res.cookie(
      "token",
      token,
      cookieOptions,
    );

    res
      .status(201)
      .json(user);
  } catch (error) {
    if (
      error.code === "23505"
    ) {
      const message =
        error.constraint?.includes(
          "dni",
        )
          ? "Ese DNI ya está registrado"
          : "Ese email ya está registrado";

      return res
        .status(400)
        .json({
          message,
        });
    }

    next(error);
  }
};

/*
  LOGIN
*/

export const signIn = async (
  req,
  res,
  next,
) => {
  try {
    const {
      dni,
      password,
    } = req.body;

    if (
      !dni ||
      !password
    ) {
      return res
        .status(400)
        .json({
          message:
            "Ingresá DNI y contraseña",
        });
    }

    const result =
      await pool.query(
        `
        SELECT *
        FROM users
        WHERE dni = $1
        `,
        [
          dni.trim(),
        ],
      );

    if (
      !result.rowCount
    ) {
      return res
        .status(400)
        .json({
          message:
            "El DNI no está registrado",
        });
    }

    const valid =
      await bcrypt.compare(
        password,
        result.rows[0]
          .password,
      );

    if (!valid) {
      return res
        .status(400)
        .json({
          message:
            "La contraseña es incorrecta",
        });
    }

    const user =
      toPublicUser(
        result.rows[0],
      );

    const token =
      await createAccessToken({
        id: user.id,
      });

    res.cookie(
      "token",
      token,
      cookieOptions,
    );

    res.json(user);
  } catch (error) {
    next(error);
  }
};

/*
  LOGOUT
*/

export const signOut = (
  _req,
  res,
) => {
  res.clearCookie(
    "token",
    {
      httpOnly: true,

      secure:
        process.env.NODE_ENV ===
        "production",

      sameSite:
        process.env.NODE_ENV ===
        "production"
          ? "none"
          : "lax",
    },
  );

  res.sendStatus(200);
};

/*
  SOLICITAR RECUPERACIÓN
*/

export const forgotPassword = async (
  req,
  res,
  next,
) => {
  try {
    const email =
      req.body.email
        ?.trim()
        .toLowerCase();

    if (!email) {
      return res
        .status(400)
        .json({
          message:
            "Ingresá tu email",
        });
    }

    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          email
        FROM users
        WHERE email = $1
        `,
        [email],
      );

    if (
      !result.rowCount
    ) {
      return res.json({
        message:
          "Si el email está registrado, vas a recibir un enlace para recuperar tu contraseña.",
      });
    }

    const user =
      result.rows[0];

    const resetToken =
      crypto
        .randomBytes(32)
        .toString("hex");

    const resetTokenHash =
      crypto
        .createHash("sha256")
        .update(resetToken)
        .digest("hex");

    const expiresAt =
      new Date(
        Date.now() +
          30 * 60 * 1000,
      );

    await pool.query(
      `
      UPDATE users
      SET
        password_reset_token = $1,
        password_reset_expires = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      `,
      [
        resetTokenHash,
        expiresAt,
        user.id,
      ],
    );

    const frontendUrl =
      (
        process.env.FRONTEND_URL ||
        "http://localhost:5173"
      ).replace(
        /\/$/,
        "",
      );

    const resetUrl =
      `${frontendUrl}/reset-password/${resetToken}`;

    try {
      await sendPasswordResetEmail({
        email:
          user.email,

        name:
          user.name,

        resetUrl,
      });
    } catch (
      emailError
    ) {
      await pool.query(
        `
        UPDATE users
        SET
          password_reset_token = NULL,
          password_reset_expires = NULL
        WHERE id = $1
        `,
        [
          user.id,
        ],
      );

      throw emailError;
    }

    res.json({
      message:
        "Si el email está registrado, vas a recibir un enlace para recuperar tu contraseña.",
    });
  } catch (error) {
    next(error);
  }
};

/*
  CAMBIAR CONTRASEÑA
*/

export const resetPassword = async (
  req,
  res,
  next,
) => {
  try {
    const {
      token,
    } = req.params;

    const {
      password,
    } = req.body;

    if (!token) {
      return res
        .status(400)
        .json({
          message:
            "El enlace de recuperación no es válido",
        });
    }

    if (
      !password ||
      password.length < 6
    ) {
      return res
        .status(400)
        .json({
          message:
            "La nueva contraseña debe tener al menos 6 caracteres",
        });
    }

    const tokenHash =
      crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");

    const result =
      await pool.query(
        `
        SELECT id
        FROM users
        WHERE password_reset_token = $1
          AND password_reset_expires >
              CURRENT_TIMESTAMP
        `,
        [
          tokenHash,
        ],
      );

    if (
      !result.rowCount
    ) {
      return res
        .status(400)
        .json({
          message:
            "El enlace de recuperación es inválido o venció",
        });
    }

    const user =
      result.rows[0];

    const hashedPassword =
      await bcrypt.hash(
        password,
        10,
      );

    await pool.query(
      `
      UPDATE users
      SET
        password = $1,
        password_reset_token = NULL,
        password_reset_expires = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      `,
      [
        hashedPassword,
        user.id,
      ],
    );

    res.json({
      message:
        "Contraseña actualizada correctamente",
    });
  } catch (error) {
    next(error);
  }
};

/*
  PERFIL
*/

export const profile = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(
        `
        SELECT
          id,
          name,
          first_name,
          last_name,
          dni,
          phone,
          email,
          city,
          gender,
          rating,
          matches_played,
          verification_status,
          verified_at,
          created_at,
          updated_at
        FROM users
        WHERE id = $1
        `,
        [
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
            "Usuario no encontrado",
        });
    }

    res.json(
      result.rows[0],
    );
  } catch (error) {
    next(error);
  }
};

/*
  ELEGIR / CAMBIAR LIGA
*/

export const chooseLeague = async (
  req,
  res,
  next,
) => {
  try {
    const {
      gender,
    } = req.body;

    if (
      !LEAGUES.includes(
        gender,
      )
    ) {
      return res
        .status(400)
        .json({
          message:
            "Liga inválida",
        });
    }

    const result =
      await pool.query(
        `
        UPDATE users
        SET
          gender = $1::varchar,

          rank_position =
            COALESCE(
              (
                SELECT
                  MAX(rank_position)
                FROM users
                WHERE city =
                    $2::varchar
                  AND gender =
                    $1::varchar
              ),
              0
            ) + 1,

          updated_at =
            CURRENT_TIMESTAMP

        WHERE id = $3

        RETURNING *
        `,
        [
          gender,
          LEAGUE_CITY,
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
            "Usuario no encontrado",
        });
    }

    res.json(
      toPublicUser(
        result.rows[0],
      ),
    );
  } catch (error) {
    next(error);
  }
};