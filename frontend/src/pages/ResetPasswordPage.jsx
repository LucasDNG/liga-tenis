import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";

import { api } from "../api";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] =
    useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();

    setMessage("");
    setError("");

    if (password.length < 6) {
      setError(
        "La contraseña debe tener al menos 6 caracteres",
      );

      return;
    }

    if (password !== confirmPassword) {
      setError(
        "Las contraseñas no coinciden",
      );

      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post(
        `/reset-password/${token}`,
        {
          password,
        },
      );

      setMessage(data.message);

      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/login");
      }, 2000);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo cambiar la contraseña",
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

        <h1>Nueva contraseña</h1>

        <p
          style={{
            color: "#9aa69d",
            lineHeight: "1.7",
            marginTop: "18px",
          }}
        >
          Elegí una nueva contraseña para tu
          cuenta de la Liga de Tenis San Pedro.
        </p>

        <form onSubmit={submit}>
          <label>
            Nueva contraseña

            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              placeholder="Mínimo 6 caracteres"
              required
            />
          </label>

          <label>
            Repetir contraseña

            <input
              type="password"
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value,
                )
              }
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
              ? "GUARDANDO..."
              : "CAMBIAR CONTRASEÑA"}
          </button>
        </form>

        <p>
          <Link to="/login">
            Volver a ingresar
          </Link>
        </p>
      </div>
    </main>
  );
}