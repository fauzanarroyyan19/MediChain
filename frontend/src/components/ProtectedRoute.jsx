
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user } = useAuth();
  const token = localStorage.getItem("medichain_token");

  if (!token || !user) {
    return <Navigate to="/login" replace />;
  }

  const role = String(user.role || "").toLowerCase();

  if (!allowedRoles.includes(role)) {
    if (["patient", "doctor", "admin"].includes(role)) {
      return <Navigate to={`/${role}/dashboard`} replace />;
    }

    return <Navigate to="/login" replace />;
  }

  return children;
}
