import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { signin } = useAuth();
  const navigate = useNavigate();
  const [dni, setDni] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    try {
      await signin({ dni, password });
      navigate("/ranking");
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo iniciar sesión");
    }
  };

  return (
    <main className="page-dark">
      <div className="form-shell">
        <span className="form-kicker">ACCESO DE JUGADORES</span>
        <h1>Ingresar</h1>
        <form onSubmit={submit}>
          <label>DNI<input value={dni} onChange={(e) => setDni(e.target.value)} /></label>
          <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="form-error">{error}</div>}
          <button className="btn-solid" type="submit">INGRESAR</button>
        </form>
        <p>¿No tenés cuenta? <Link to="/register">Registrate</Link></p>
      </div>
    </main>
  );
}
