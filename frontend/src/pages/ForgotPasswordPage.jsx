import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    setMessage("");
    setError("");
    setLoading(true);

    try {
      const { data } = await api.post(
        "/forgot-password",
        {
          email,
        },
      );

      setMessage(data.message);
      setEmail("");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo procesar la solicitud",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="page-dark">
      <div className="form-shell">
        <span className="form-kicker">
          RECUPERACIÓN DE CUENTA
        </span>

        <h1>¿Olvidaste tu contraseña?</h1>

        <p
          style={{
            color: "#9aa69d",
            lineHeight: "1.7",
            marginTop: "18px",
          }}
        >
          Ingresá el email con el que te registraste.
          Si encontramos una cuenta asociada, te
          enviaremos un enlace para crear una nueva
          contraseña.
        </p>

        <form onSubmit={submit}>
          <label>
            Email

            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="tuemail@ejemplo.com"
              required
            />
          </label>

          {error && (
            <div className="form-error">
              {error}
            </div>
          )}

          {message && (
            <div className="notice">
              {message}
            </div>
          )}

          <button
            className="btn-solid"
            type="submit"
            disabled={loading}
          >
            {loading
              ? "ENVIANDO..."
              : "ENVIAR ENLACE"}
          </button>
        </form>

        <p>
          <Link to="/login">
            ← Volver a ingresar
          </Link>
        </p>
      </div>
    </main>
  );
}