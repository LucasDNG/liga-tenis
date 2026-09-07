const buckets =
  new Map();


const cleanupInterval =
  setInterval(
    () => {
      const now =
        Date.now();

      for (
        const [
          key,
          bucket,
        ] of buckets
      ) {
        if (
          bucket.resetAt <=
          now
        ) {
          buckets.delete(
            key,
          );
        }
      }
    },
    5 * 60 * 1000,
  );


cleanupInterval.unref?.();


/*
  ============================================================
  HEADERS DE SEGURIDAD
  ============================================================
*/

export const securityHeaders = (
  req,
  res,
  next,
) => {
  res.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );

  res.setHeader(
    "X-Frame-Options",
    "DENY",
  );

  res.setHeader(
    "Referrer-Policy",
    "no-referrer",
  );

  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  res.setHeader(
    "Cross-Origin-Opener-Policy",
    "same-origin",
  );

  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
    ].join("; "),
  );


  if (
    process.env.NODE_ENV ===
    "production"
  ) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }


  next();
};


/*
  ============================================================
  PROTECCIÓN DE ORIGEN / CSRF
  ============================================================

  La autenticación usa cookie httpOnly.

  En producción usamos SameSite=None
  porque frontend y backend están en
  dominios distintos.

  Por eso las operaciones que modifican
  datos deben rechazar Origin ajenos.
*/

const normalizeOrigin = (
  value,
) => {
  if (!value) {
    return null;
  }

  return String(value)
    .trim()
    .replace(
      /\/$/,
      "",
    );
};


const getAllowedOrigins = () => {
  const origins =
    new Set();


  const frontendOrigin =
    normalizeOrigin(
      process.env
        .FRONTEND_URL,
    );


  if (frontendOrigin) {
    origins.add(
      frontendOrigin,
    );
  }


  /*
    Desarrollo local.
  */

  if (
    process.env.NODE_ENV !==
    "production"
  ) {
    origins.add(
      "http://localhost:5173",
    );

    origins.add(
      "http://127.0.0.1:5173",
    );
  }


  return origins;
};


const SAFE_METHODS =
  new Set([
    "GET",
    "HEAD",
    "OPTIONS",
  ]);


export const requireTrustedOrigin = (
  req,
  res,
  next,
) => {
  if (
    SAFE_METHODS.has(
      req.method,
    )
  ) {
    return next();
  }


  const origin =
    normalizeOrigin(
      req.get(
        "origin",
      ),
    );


  /*
    Requests sin Origin pueden venir,
    por ejemplo, de herramientas
    administrativas o health checks.

    La protección principal acá es
    impedir solicitudes cross-site
    iniciadas por navegadores.
  */

  if (!origin) {
    return next();
  }


  const allowedOrigins =
    getAllowedOrigins();


  if (
    !allowedOrigins.has(
      origin,
    )
  ) {
    return res
      .status(403)
      .json({
        message:
          "Origen no autorizado",

        reason:
          "invalid_origin",
      });
  }


  next();
};


/*
  ============================================================
  RATE LIMIT
  ============================================================

  Implementación liviana en memoria.

  Para esta aplicación y una instancia
  de Render alcanza como primera capa
  contra abuso/brute force.

  Si en el futuro se escala a múltiples
  instancias, conviene mover estos
  contadores a Redis.
*/

const makeRateLimiter = ({
  windowMs,
  max,
  prefix,
  message,
}) => {
  return (
    req,
    res,
    next,
  ) => {
    const now =
      Date.now();


    const ip =
      req.ip ||
      req.socket
        ?.remoteAddress ||
      "unknown";


    const key =
      `${prefix}:${ip}`;


    let bucket =
      buckets.get(
        key,
      );


    if (
      !bucket ||
      bucket.resetAt <=
        now
    ) {
      bucket = {
        count:
          0,

        resetAt:
          now +
          windowMs,
      };

      buckets.set(
        key,
        bucket,
      );
    }


    bucket.count +=
      1;


    const remaining =
      Math.max(
        0,
        max -
          bucket.count,
      );


    const resetSeconds =
      Math.max(
        1,
        Math.ceil(
          (
            bucket.resetAt -
            now
          ) /
            1000,
        ),
      );


    res.setHeader(
      "RateLimit-Limit",
      String(max),
    );

    res.setHeader(
      "RateLimit-Remaining",
      String(
        remaining,
      ),
    );

    res.setHeader(
      "RateLimit-Reset",
      String(
        resetSeconds,
      ),
    );


    if (
      bucket.count >
      max
    ) {
      res.setHeader(
        "Retry-After",
        String(
          resetSeconds,
        ),
      );


      return res
        .status(429)
        .json({
          message,

          reason:
            "rate_limit",

          retry_after_seconds:
            resetSeconds,
        });
    }


    next();
  };
};


/*
  ============================================================
  LIMITADOR GENERAL
  ============================================================
*/

export const generalApiLimiter =
  makeRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      500,

    prefix:
      "api",

    message:
      "Demasiadas solicitudes. Intentá nuevamente en unos minutos.",
  });


/*
  ============================================================
  LOGIN
  ============================================================
*/

export const signInLimiter =
  makeRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      10,

    prefix:
      "signin",

    message:
      "Demasiados intentos de inicio de sesión. Esperá unos minutos antes de volver a intentar.",
  });


/*
  ============================================================
  REGISTRO
  ============================================================
*/

export const signUpLimiter =
  makeRateLimiter({
    windowMs:
      60 * 60 * 1000,

    max:
      5,

    prefix:
      "signup",

    message:
      "Se realizaron demasiados intentos de registro desde esta conexión. Intentá nuevamente más tarde.",
  });


/*
  ============================================================
  RECUPERACIÓN DE CONTRASEÑA
  ============================================================
*/

export const forgotPasswordLimiter =
  makeRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      5,

    prefix:
      "forgot-password",

    message:
      "Se solicitaron demasiados enlaces de recuperación. Esperá unos minutos antes de volver a intentar.",
  });


/*
  ============================================================
  RESET DE CONTRASEÑA
  ============================================================
*/

export const resetPasswordLimiter =
  makeRateLimiter({
    windowMs:
      15 * 60 * 1000,

    max:
      10,

    prefix:
      "reset-password",

    message:
      "Demasiados intentos de recuperación. Esperá unos minutos antes de volver a intentar.",
  });