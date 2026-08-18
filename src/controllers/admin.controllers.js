import { pool } from "../db.js";
import cloudinary from "../config/cloudinary.js";

/*
  LISTAR USUARIOS PENDIENTES
*/

export const getPendingUsers = async (
  _req,
  res,
  next,
) => {
  try {
    const result = await pool.query(`
      SELECT
        id,
        name,
        first_name,
        last_name,
        dni,
        phone,
        email,
        gender,
        verification_status,
        created_at
      FROM users
      WHERE verification_status = 'pending_verification'
      ORDER BY created_at ASC
    `);

    res.json({
      users: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/*
  VER UN USUARIO PENDIENTE
*/

export const getPendingUserById = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        first_name,
        last_name,
        dni,
        phone,
        email,
        gender,
        verification_status,
        dni_front_path,
        dni_back_path,
        created_at
      FROM users
      WHERE id = $1
      `,
      [id],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    const user = result.rows[0];

    /*
      Generamos URLs firmadas para poder
      visualizar los DNI authenticated.
    */

    const dniFrontUrl = user.dni_front_path
      ? cloudinary.url(user.dni_front_path, {
          type: "authenticated",
          secure: true,
          sign_url: true,
        })
      : null;

    const dniBackUrl = user.dni_back_path
      ? cloudinary.url(user.dni_back_path, {
          type: "authenticated",
          secure: true,
          sign_url: true,
        })
      : null;

    res.json({
      user: {
        id: user.id,
        name: user.name,
        first_name: user.first_name,
        last_name: user.last_name,
        dni: user.dni,
        phone: user.phone,
        email: user.email,
        gender: user.gender,
        verification_status:
          user.verification_status,
        created_at: user.created_at,

        dni_front_url: dniFrontUrl,
        dni_back_url: dniBackUrl,
      },
    });
  } catch (error) {
    next(error);
  }
};

/*
  APROBAR USUARIO
*/

export const approveUser = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        verification_status = 'verified',
        verified_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING
        id,
        name,
        email,
        verification_status,
        verified_at
      `,
      [id],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    res.json({
      message:
        "Jugador aprobado correctamente",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/*
  RECHAZAR USUARIO
*/

export const rejectUser = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `
      UPDATE users
      SET
        verification_status = 'rejected',
        verified_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING
        id,
        name,
        email,
        verification_status
      `,
      [id],
    );

    if (!result.rowCount) {
      return res.status(404).json({
        message: "Usuario no encontrado",
      });
    }

    res.json({
      message:
        "Jugador rechazado correctamente",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};