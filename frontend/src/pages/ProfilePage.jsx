import { useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [message, setMessage] = useState("");

  const choose = async (gender) => {
    try {
      const { data } = await api.patch("/profile/league", { gender });
      setUser(data);
      setMessage("Liga actualizada.");
    } catch (error) {
      setMessage(error.response?.data?.message || "No se pudo actualizar la liga");
    }
  };

  return (
    <main className="page-dark">
      <div className="site-width page-content">
        <div className="profile-dark">
          <span>JUGADOR</span>
          <h1>{user?.name}</h1>
          <p>{user?.gender === "female" ? "Liga Femenina" : user?.gender === "male" ? "Liga Masculina" : "Todavía no elegiste liga"}</p>
          <div className="profile-stats">
            <div><small>ELO</small><strong>{user?.rating}</strong></div>
            <div><small>PARTIDOS</small><strong>{user?.matches_played}</strong></div>
            <div><small>DNI</small><strong>{user?.verification_status === "verified" ? "Verificado" : "Pendiente"}</strong></div>
          </div>

          {!user?.gender && (
            <div className="choose-league">
              <h2>Elegí tu liga</h2>
              <p>Esto es necesario para aparecer en el ranking correcto y poder desafiar.</p>
              <button className="small-action" onClick={() => choose("male")}>Liga Masculina</button>
              <button className="small-action secondary" onClick={() => choose("female")}>Liga Femenina</button>
            </div>
          )}
          {message && <div className="notice">{message}</div>}
        </div>
      </div>
    </main>
  );
}
