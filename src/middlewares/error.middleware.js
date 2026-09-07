import multer from "multer";


/*
  ============================================================
  ERRORES CENTRALIZADOS
  ============================================================

  Objetivos:

  - no filtrar errores internos en producción
  - devolver mensajes claros para errores conocidos
  - tratar correctamente errores de Multer
  - mantener logs útiles en servidor
*/


const isProduction =
  process.env.NODE_ENV ===
  "production";


const logError = (
  error,
  req,
) => {
  console.error(
    "=== ERROR ===",
  );

  console.error({
    method:
      req?.method,

    path:
      req?.originalUrl,

    name:
      error?.name,

    code:
      error?.code,

    message:
      error?.message,

    stack:
      error?.stack,
  });
};


/*
  ============================================================
  MULTER
  ============================================================
*/

const handleMulterError = (
  error,
  res,
) => {
  if (
    error.code ===
    "LIMIT_FILE_SIZE"
  ) {
    return res
      .status(413)
      .json({
        message:
          "Cada imagen del DNI puede pesar como máximo 5 MB.",

        reason:
          "file_too_large",
      });
  }


  if (
    error.code ===
    "LIMIT_FILE_COUNT"
  ) {
    return res
      .status(400)
      .json({
        message:
          "Se enviaron demasiados archivos.",

        reason:
          "too_many_files",
      });
  }


  if (
    error.code ===
      "LIMIT_UNEXPECTED_FILE" ||
    error.code ===
      "LIMIT_FIELD_COUNT"
  ) {
    return res
      .status(400)
      .json({
        message:
          "Los archivos enviados no tienen el formato esperado.",

        reason:
          "invalid_upload",
      });
  }


  return res
    .status(400)
    .json({
      message:
        "No se pudieron procesar los archivos enviados.",

      reason:
        "upload_error",
    });
};


/*
  ============================================================
  POSTGRESQL
  ============================================================
*/

const handleDatabaseError = (
  error,
  res,
) => {
  /*
    Unique violation
  */

  if (
    error.code ===
    "23505"
  ) {
    return res
      .status(409)
      .json({
        message:
          "Ya existe un registro con esos datos.",

        reason:
          "duplicate_record",
      });
  }


  /*
    Foreign key violation
  */

  if (
    error.code ===
    "23503"
  ) {
    return res
      .status(409)
      .json({
        message:
          "La operación no puede realizarse porque depende de otros datos.",

        reason:
          "foreign_key_conflict",
      });
  }


  /*
    Invalid input syntax
  */

  if (
    error.code ===
    "22P02"
  ) {
    return res
      .status(400)
      .json({
        message:
          "Uno de los datos enviados no es válido.",

        reason:
          "invalid_input",
      });
  }


  return null;
};


/*
  ============================================================
  ERROR HANDLER
  ============================================================
*/

export const errorHandler = (
  error,
  req,
  res,
  _next,
) => {
  /*
    Nunca intentar responder dos veces.
  */

  if (
    res.headersSent
  ) {
    return;
  }


  logError(
    error,
    req,
  );


  /*
    MULTER
  */

  if (
    error instanceof
    multer.MulterError
  ) {
    return handleMulterError(
      error,
      res,
    );
  }


  /*
    Error propio del filtro de archivos.
  */

  if (
    error?.message ===
    "Las fotos del DNI deben ser JPG, PNG o WEBP"
  ) {
    return res
      .status(400)
      .json({
        message:
          "Las fotos del DNI deben ser JPG, PNG o WEBP.",

        reason:
          "invalid_file_type",
      });
  }


  /*
    POSTGRESQL
  */

  if (
    typeof error?.code ===
    "string"
  ) {
    const handled =
      handleDatabaseError(
        error,
        res,
      );


    if (handled) {
      return handled;
    }
  }


  /*
    Error HTTP controlado.
  */

  const status =
    Number(
      error?.status ||
      error?.statusCode,
    );


  if (
    Number.isInteger(
      status,
    ) &&
    status >= 400 &&
    status < 500
  ) {
    return res
      .status(status)
      .json({
        message:
          error.message ||
          "Solicitud inválida",

        reason:
          error.reason ||
          "request_error",
      });
  }


  /*
    ERROR INTERNO

    En producción nunca exponemos:
    - stack
    - mensajes SQL
    - nombres de tablas
    - detalles internos
    - errores de librerías
  */

  return res
    .status(500)
    .json({
      message:
        isProduction
          ? "Error interno del servidor"
          : error?.message ||
            "Error interno del servidor",

      reason:
        "internal_error",
    });
};