import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export function AdminLayout( ) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4">
        <header className="surface-panel p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow-label">Administracion</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950">Panel Admin</h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">{user?.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link className="secondary-button" to="/admin">Dashboard</Link>
              <Link className="secondary-button" to="/admin/users">Usuarios</Link>
              <Link className="secondary-button" to="/app">App</Link>
              <Link className="secondary-button" to="/chatbot">Chatbot</Link>
            </div>
          </div>
        </header>

        <div className="surface-panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
            <div>
              <p className="text-sm font-semibold text-slate-900">Control operativo</p>
              <p className="text-sm text-slate-500">Gestiona accesos, bloqueos, roles y verificacion.</p>
            </div>
            <button
              className="primary-button bg-brand-900 hover:bg-brand-700"
              onClick={() => {
                logout().then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true }));
              }}
            >
              Salir
            </button>
          </header>
          <main className="p-4 sm:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

