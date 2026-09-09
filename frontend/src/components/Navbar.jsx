import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";

import "./Navbar.css";


export default function Navbar() {
  const {
    user,
    logout,
  } =
    useAuth();

  const navigate =
    useNavigate();


  const handleLogout = () => {
    logout();

    navigate("/");
  };


  const linkClass = ({
    isActive,
  }) =>
    isActive
      ? "navbar-link active"
      : "navbar-link";


  return (
    <header className="navbar-shell">
      <nav className="navbar">
        <NavLink
          to="/"
          className="navbar-brand"
          aria-label="LA RED - Inicio"
        >
          <span className="navbar-brand-mark">
            LR
          </span>

          <span className="navbar-brand-copy">
            <strong>
              LA RED
            </strong>

            <small>
              LIGA DE TENIS · SAN PEDRO
            </small>
          </span>
        </NavLink>

        <div className="navbar-links">
          <NavLink
            to="/"
            className={linkClass}
            end
          >
            Inicio
          </NavLink>

          <NavLink
            to="/ranking"
            className={linkClass}
          >
            Ranking
          </NavLink>

          {user && (
            <>
              <NavLink
                to="/challenges"
                className={linkClass}
              >
                Desafíos
              </NavLink>

              <NavLink
                to="/matches"
                className={linkClass}
              >
                Mis partidos
              </NavLink>

              <NavLink
                to="/profile"
                className={linkClass}
              >
                Mi perfil
              </NavLink>
            </>
          )}

          {user?.role ===
            "admin" && (
            <NavLink
              to="/admin"
              className={linkClass}
            >
              Admin
            </NavLink>
          )}
        </div>

        <div className="navbar-actions">
          {!user ? (
            <>
              <NavLink
                to="/login"
                className="navbar-login"
              >
                Ingresar
              </NavLink>

              <NavLink
                to="/register"
                className="navbar-register"
              >
                Sumate
              </NavLink>
            </>
          ) : (
            <>
              <div className="navbar-user">
                <span className="navbar-user-label">
                  Jugador
                </span>

                <strong>
                  {user.first_name ||
                    user.name ||
                    "LA RED"}
                </strong>
              </div>

              <button
                type="button"
                className="navbar-logout"
                onClick={
                  handleLogout
                }
              >
                Salir
              </button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}