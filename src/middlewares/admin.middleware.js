import { pool } from "../db.js";

export const isAdmin = async (
  req,
  res,
  next,
) => {
  try {
    const result =
      await pool.query(
        `
        SELECT role
        FROM users
        WHERE id = $1
        `,
        [req.userId],
      );

    if (!result.rowCount) {
      return res
        .status(401)
        .json({
          message:
            "Usuario no encontrado",
        });
    }

    if (
      result.rows[0].role !==
      "admin"
    ) {
      return res
        .status(403)
        .json({
          message:
            "No tenés permisos de administrador",
        });
    }

    next();
  } catch (error) {
    next(error);
  }
};