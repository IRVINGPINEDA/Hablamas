import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function AdminLayout( ) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-slate-100 p-4 lg:p-8">
      <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Panel Admin</h1>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm" to="/admin">Dashboard</Link>
            <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm" to="/admin/users">Usuarios</Link>
            <button
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white"
              onClick={() => {
                logout().then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true }));
              }}
            >
              Salir
            </button>
          </div>
        </header>
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

