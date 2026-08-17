import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY,
);

export const sendPasswordResetEmail = async ({
  email,
  name,
  resetUrl,
}) => {
  const from =
    process.env.RESEND_FROM ||
    "Liga de Tenis San Pedro <onboarding@resend.dev>";

  const { data, error } =
    await resend.emails.send({
      from,

      to: email,

      subject:
        "Recuperá tu contraseña - Liga de Tenis San Pedro",

      html: `
        <div
          style="
            font-family: Arial, Helvetica, sans-serif;
            max-width: 600px;
            margin: 0 auto;
            background: #07110c;
            color: #eeeadd;
            padding: 36px;
          "
        >
          <div
            style="
              border-bottom: 1px solid #29402f;
              padding-bottom: 22px;
              margin-bottom: 28px;
            "
          >
            <div
              style="
                color: #9bbe61;
                font-size: 12px;
                font-weight: bold;
                letter-spacing: 2px;
                margin-bottom: 8px;
              "
            >
              SAN PEDRO · BUENOS AIRES
            </div>

            <h1
              style="
                color: #f2efe4;
                font-size: 28px;
                margin: 0;
              "
            >
              Liga de Tenis San Pedro
            </h1>
          </div>

          <p
            style="
              font-size: 17px;
              color: #f2efe4;
            "
          >
            Hola ${name},
          </p>

          <p
            style="
              line-height: 1.7;
              color: #c9cdc6;
              font-size: 15px;
            "
          >
            Recibimos una solicitud para cambiar
            la contraseña de tu cuenta.
          </p>

          <p
            style="
              line-height: 1.7;
              color: #c9cdc6;
              font-size: 15px;
            "
          >
            Para crear una nueva contraseña,
            presioná el siguiente botón:
          </p>

          <div
            style="
              margin: 32px 0;
            "
          >
            <a
              href="${resetUrl}"
              style="
                display: inline-block;
                background: #96b957;
                color: #07110c;
                text-decoration: none;
                padding: 15px 24px;
                font-size: 14px;
                font-weight: bold;
              "
            >
              CREAR NUEVA CONTRASEÑA →
            </a>
          </div>

          <div
            style="
              background: #0b1710;
              border-left: 3px solid #9bbe61;
              padding: 16px 18px;
              margin: 26px 0;
            "
          >
            <p
              style="
                margin: 0;
                color: #c9cdc6;
                line-height: 1.6;
                font-size: 14px;
              "
            >
              Este enlace es válido durante
              <strong style="color: #9bbe61;">
                30 minutos
              </strong>.
            </p>
          </div>

          <p
            style="
              line-height: 1.7;
              color: #8e9a91;
              font-size: 13px;
            "
          >
            Si vos no solicitaste cambiar tu
            contraseña, ignorá este correo.
          </p>
        </div>
      `,
    });

  if (error) {
    console.error(
      "Error enviando email con Resend:",
      error,
    );

    throw new Error(
      error.message ||
        "No se pudo enviar el email de recuperación",
    );
  }

  console.log(
    "Email de recuperación enviado:",
    data?.id,
  );

  return data;
};