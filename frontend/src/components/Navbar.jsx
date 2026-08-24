import {
  useEffect,
  useState,
} from "react";

import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  useAuth,
} from "../context/AuthContext";


export default function Navbar() {
  const {
    user,
    signout,
  } = useAuth();

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);


  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);


  const out = async () => {
    setMenuOpen(false);

    await signout();

    navigate("/");
  };


  const closeMenu = () => {
    setMenuOpen(false);
  };


  return (
    <nav className="site-nav">
      <div className="nav-inner">

        <Link
          className="brand"
          to="/"
          onClick={closeMenu}
        >
          <span
            className="tennis-logo"
            aria-hidden="true"
          >
            <span className="ball-seam seam-one" />
            <span className="ball-seam seam-two" />

            <small>
              SP
            </small>
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


        <button
          type="button"
          className={
            menuOpen
              ? "menu-toggle open"
              : "menu-toggle"
          }
          aria-label={
            menuOpen
              ? "Cerrar menú"
              : "Abrir menú"
          }
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() =>
            setMenuOpen(
              (current) =>
                !current,
            )
          }
        >
          <span />
          <span />
          <span />
        </button>


        <div
          id="main-navigation"
          className={
            menuOpen
              ? "nav-links open"
              : "nav-links"
          }
        >
          <Link
            to="/ranking"
            className="nav-link"
            onClick={closeMenu}
          >
            Ranking
          </Link>

          <Link
            to="/partidos"
            className="nav-link"
            onClick={closeMenu}
          >
            Partidos
          </Link>

          <Link
            to="/elo"
            className="nav-link"
            onClick={closeMenu}
          >
            Sistema Elo
          </Link>

          {user ? (
            <>
              <Link
                to="/challenges"
                className="nav-link"
                onClick={closeMenu}
              >
                Desafíos
              </Link>

              <Link
                to="/matches"
                className="nav-link"
                onClick={closeMenu}
              >
                Mis partidos
              </Link>

              <Link
                to="/profile"
                className="nav-link"
                onClick={closeMenu}
              >
                Mi perfil
              </Link>

              {user.role ===
                "admin" && (
                <Link
                  to="/admin"
                  className="nav-link"
                  onClick={closeMenu}
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
                onClick={closeMenu}
              >
                Ingresar
              </Link>

              <Link
                to="/register"
                className="nav-link nav-cta"
                onClick={closeMenu}
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