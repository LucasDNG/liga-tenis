import bcrypt from "bcrypt";
import { pool } from "../db.js";
import { createAccessToken } from "../libs/jwt.js";
import { LEAGUE_CITY, LEAGUES } from "../constants/league.js";
import { titleCase, toPublicUser } from "../utils/user.js";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  maxAge: 1000 * 60 * 60 * 24,
};

export const signUp = async (req, res, next) => {
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

    if (!first_name || !last_name || !dni || !phone || !email || !password) {
      return res.status(400).json({ message: "Completá todos los campos" });
    }

    if (!LEAGUES.includes(gender)) {
      return res.status(400).json({
        message: "Elegí Liga Masculina o Liga Femenina",
      });
    }

    if (!req.files?.dni_front?.[0] || !req.files?.dni_back?.[0]) {
      return res.status(400).json({
        message: "Debés subir frente y dorso del DNI",
      });
    }

    const first = titleCase(first_name);
    const last = titleCase(last_name);
    const name = `${first} ${last}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users (
        name, first_name, last_name, dni, phone, email, password,
        city, gender, rank_position, rating, matches_played,
        dni_front_path, dni_back_path, verification_status
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,
        COALESCE((
          SELECT MAX(rank_position)
          FROM users
          WHERE city = $8 AND gender = $9
        ),0) + 1,
        1500,0,$10,$11,'pending_verification'
      )
      RETURNING *
      `,
      [
        name,
        first,
        last,
        dni.trim(),
        phone.trim(),
        email.trim().toLowerCase(),
        hashedPassword,
        LEAGUE_CITY,
        gender,
        req.files.dni_front[0].path,
        req.files.dni_back[0].path,
      ],
    );

    const user = toPublicUser(result.rows[0]);
    const token = await createAccessToken({ id: user.id });

    res.cookie("token", token, cookieOptions);
    res.status(201).json(user);
  } catch (error) {
    if (error.code === "23505") {
      const message = error.constraint?.includes("dni")
        ? "Ese DNI ya está registrado"
        : "Ese email ya está registrado";
      return res.status(400).json({ message });
    }
    next(error);
  }
};

export const signIn = async (req, res, next) => {
  try {
    const { dni, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE dni = $1",
      [dni?.trim()],
    );

    if (!result.rowCount) {
      return res.status(400).json({ message: "El DNI no está registrado" });
    }

    const valid = await bcrypt.compare(password, result.rows[0].password);
    if (!valid) {
      return res.status(400).json({ message: "La contraseña es incorrecta" });
    }

    const user = toPublicUser(result.rows[0]);
    const token = await createAccessToken({ id: user.id });
    res.cookie("token", token, cookieOptions);
    res.json(user);
  } catch (error) {
    next(error);
  }
};

export const signOut = (_req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });
  res.sendStatus(200);
};

export const profile = async (req, res, next) => {
  try {
    const result = await pool.query(
      `
      SELECT id,name,first_name,last_name,dni,phone,email,city,gender,
             rating,matches_played,verification_status,verified_at,
             created_at,updated_at
      FROM users
      WHERE id = $1
      `,
      [req.userId],
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: "Usuario no encontrado" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

export const chooseLeague = async (req, res, next) => {
  try {
    const { gender } = req.body;

    if (!LEAGUES.includes(gender)) {
      return res.status(400).json({
        message: "Liga inválida",
      });
    }

    const result = await pool.query(
      `
      UPDATE users
      SET gender = $1,
          rank_position = COALESCE((
            SELECT MAX(rank_position)
            FROM users
            WHERE city = $2 AND gender = $1
          ),0) + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
      `,
      [gender, LEAGUE_CITY, req.userId],
    );

    res.json(toPublicUser(result.rows[0]));
  } catch (error) {
    next(error);
  }
};
