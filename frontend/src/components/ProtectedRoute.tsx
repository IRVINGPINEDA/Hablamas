import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireChatAccess?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireChatAccess = false }: ProtectedRouteProps ) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-slate-600">Cargando...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  if (requireChatAccess && (!user.emailConfirmed || user.mustChangePassword)) {
    return <Navigate to="/verify-email" replace />;
  }

  if (requireAdmin && !user.roles.includes("Admin")) {
    return <Navigate to="/app" replace />;
  }

  return children;
}

