import {
  Link,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, signout } =
    useAuth();

  const navigate = useNavigate();

  const out = async () => {
    await signout();
    navigate("/");
  };

  return (
    <nav className="site-nav">
      <div className="nav-inner">
        <Link
          className="brand"
          to="/"
        >
          <span
            className="tennis-logo"
            aria-hidden="true"
          >
            <span className="ball-seam seam-one" />
            <span className="ball-seam seam-two" />

            <small>SP</small>
          </span>

          <span className="brand-copy">
            <strong>
              Liga de Tenis
            </strong>

            <small>
              {user?.gender ===
              "female"
                ? "Liga Femenina"
                : user?.gender ===
                    "male"
                  ? "Liga Masculina"
                  : "San Pedro · Buenos Aires"}
            </small>
          </span>
        </Link>

        <div className="nav-links">
          <Link
            to="/ranking"
            className="nav-link"
          >
            Ranking
          </Link>

          <Link
            to="/elo"
            className="nav-link"
          >
            Sistema Elo
          </Link>

          {user ? (
            <>
              <Link
                to="/challenges"
                className="nav-link"
              >
                Desafíos
              </Link>

              <Link
                to="/matches"
                className="nav-link"
              >
                Partidos
              </Link>

              <Link
                to="/profile"
                className="nav-link"
              >
                Mi perfil
              </Link>

              {user.role ===
                "admin" && (
                <Link
                  to="/admin"
                  className="nav-link"
                >
                  Administración
                </Link>
              )}

              <button
                onClick={out}
                className="nav-link nav-out"
              >
                Salir
              </button>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="nav-link"
              >
                Ingresar
              </Link>

              <Link
                to="/register"
                className="nav-link nav-cta"
              >
                Registrarme
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}