import { useState } from "react";

import {
  useNavigate,
  Link,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { signup } = useAuth();

  const navigate =
    useNavigate();

  const [error, setError] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const submit = async (event) => {
    event.preventDefault();

    if (loading) return;

    setError("");
    setLoading(true);

    const form =
      new FormData(
        event.currentTarget,
      );

    try {
      await signup(form);

      navigate("/profile");
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "No se pudo completar el registro",
      );

      setLoading(false);
    }
  };

  return (
    <main className="page-dark">
      <div className="form-shell form-wide">
        <span className="form-kicker">
          NUEVO JUGADOR
        </span>

        <h1>Registrarme</h1>

        <p className="dim">
          Elegí la liga en la que vas
          a competir.
        </p>

        <form
          onSubmit={submit}
          className="form-grid-dark"
        >
          <label>
            Nombre

            <input
              name="first_name"
              disabled={loading}
              required
            />
          </label>

          <label>
            Apellido

            <input
              name="last_name"
              disabled={loading}
              required
            />
          </label>

          <label>
            DNI

            <input
              name="dni"
              disabled={loading}
              required
            />
          </label>

          <label>
            Teléfono / WhatsApp

            <input
              name="phone"
              disabled={loading}
              required
            />
          </label>

          <label>
            Email

            <input
              name="email"
              type="email"
              disabled={loading}
              required
            />
          </label>

          <label>
            Contraseña

            <input
              name="password"
              type="password"
              minLength="6"
              disabled={loading}
              required
            />
          </label>

          <label className="full">
            Liga

            <select
              name="gender"
              required
              defaultValue=""
              disabled={loading}
            >
              <option
                value=""
                disabled
              >
                Elegí una liga
              </option>

              <option value="male">
                Liga Masculina
              </option>

              <option value="female">
                Liga Femenina
              </option>
            </select>
          </label>

          <label>
            Foto frente del DNI

            <input
              name="dni_front"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={loading}
              required
            />
          </label>

          <label>
            Foto dorso del DNI

            <input
              name="dni_back"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={loading}
              required
            />
          </label>

          {error && (
            <div className="form-error full">
              {error}
            </div>
          )}

          {loading && (
            <div className="notice full">
              Creando cuenta y
              subiendo documentación...
              No cierres esta página.
            </div>
          )}

          <button
            className="btn-solid full"
            type="submit"
            disabled={loading}
            style={{
              opacity: loading
                ? 0.7
                : 1,
              cursor: loading
                ? "wait"
                : "pointer",
            }}
          >
            {loading
              ? "CREANDO CUENTA..."
              : "CREAR CUENTA"}
          </button>
        </form>

        <p>
          ¿Ya tenés cuenta?{" "}
          <Link to="/login">
            Ingresar
          </Link>
        </p>
      </div>
    </main>
  );
}