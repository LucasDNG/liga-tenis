import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { user, loadingAuth } = useAuth();

  if (loadingAuth) {
    return <div className="page-state">Cargando...</div>;
  }

  return user ? children : <Navigate to="/login" replace />;
}
