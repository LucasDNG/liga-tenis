import { Link } from "react-router-dom";
export default function NotFound() {
  return <main className="page-dark"><div className="form-shell"><h1>404</h1><p>Página no encontrada.</p><Link to="/">Volver al inicio</Link></div></main>;
}
