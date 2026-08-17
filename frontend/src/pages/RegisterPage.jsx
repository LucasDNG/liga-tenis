import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await signup(form);
      navigate("/ranking");
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo completar el registro");
    }
  };

  return (
    <main className="page-dark">
      <div className="form-shell form-wide">
        <span className="form-kicker">NUEVO JUGADOR</span>
        <h1>Registrarme</h1>
        <p className="dim">Elegí la liga en la que vas a competir.</p>

        <form onSubmit={submit} className="form-grid-dark">
          <label>Nombre<input name="first_name" required /></label>
          <label>Apellido<input name="last_name" required /></label>
          <label>DNI<input name="dni" required /></label>
          <label>Teléfono / WhatsApp<input name="phone" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Contraseña<input name="password" type="password" minLength="6" required /></label>

          <label className="full">
            Liga
            <select name="gender" required defaultValue="">
              <option value="" disabled>Elegí una liga</option>
              <option value="male">Liga Masculina</option>
              <option value="female">Liga Femenina</option>
            </select>
          </label>

          <label>Foto frente del DNI<input name="dni_front" type="file" accept="image/*" required /></label>
          <label>Foto dorso del DNI<input name="dni_back" type="file" accept="image/*" required /></label>

          {error && <div className="form-error full">{error}</div>}
          <button className="btn-solid full" type="submit">CREAR CUENTA</button>
        </form>

        <p>¿Ya tenés cuenta? <Link to="/login">Ingresar</Link></p>
      </div>
    </main>
  );
}
