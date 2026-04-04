import { useEffect, useState } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { authApi } from "../../lib/api";

interface UserDetail {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  bio: string;
  publicAlias: string;
  publicCode: string;
  emailConfirmed: boolean;
  mustChangePassword: boolean;
  isBlocked: boolean;
  createdAt: string;
  lastLoginAt?: string;
  roles: string[];
}

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function extractApiError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "Error inesperado.";
  }

  const data = error.response?.data as ApiProblemResponse | undefined;
  const fieldErrors = data?.errors ? Object.values(data.errors).flat().filter(Boolean) : [];
  if (fieldErrors.length > 0) {
    return fieldErrors.join(" ");
  }

  return data?.detail ?? data?.title ?? `Error ${error.response?.status ?? ""}`.trim();
}

export function AdminUserDetailPage( ) {
  const params = useParams();
  const userId = params.id;
  const [user, setUser] = useState<UserDetail | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lastTemporaryPassword, setLastTemporaryPassword] = useState<string | null>(null);
  const [sendTempByEmail, setSendTempByEmail] = useState(true);

  const load = async (): Promise<void> => {
    if (!userId) {
      return;
    }

    const response = await authApi.get(`/admin/users/${userId}`);
    setUser(response.data as UserDetail);
  };

  useEffect(() => {
    load().catch(() => {
      setStatus("No se pudo cargar el usuario.");
    });
  }, [userId]);

  const action = async (url: string, body?: unknown): Promise<void> => {
    if (!userId) {
      return;
    }

    await authApi.post(`/admin/users/${userId}/${url}`, body ?? {});
    await load();
    setStatus(`Accion completada: ${url}`);
  };

  const forceResetPassword = async (): Promise<void> => {
    if (!userId) {
      return;
    }

    const response = await authApi.post(`/admin/users/${userId}/force-reset-password`, {
      sendEmail: sendTempByEmail
    });

    setLastTemporaryPassword((response.data.temporaryPassword as string | undefined) ?? null);
    await load();
    setStatus(sendTempByEmail
      ? "Contrasena temporal generada y enviada por email."
      : "Contrasena temporal generada.");
  };

  if (!user) {
    return <p className="text-slate-500">Cargando usuario...</p>;
  }

  return (
    <section className="space-y-4">
      <header className="rounded-[28px] border border-white/70 bg-white/82 p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
        <p className="eyebrow-label">Detalle de usuario</p>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{user.firstName} {user.lastName}</h2>
        <p className="mt-2 text-sm text-slate-600">{user.email}</p>
        <p className="mt-1 text-xs text-slate-500">Codigo publico: {user.publicCode}</p>
      </header>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[28px] border border-white/70 bg-white/82 p-5 text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
          <p><strong>Telefono:</strong> {user.phone}</p>
          <p><strong>Direccion:</strong> {user.address}</p>
          <p><strong>Bio:</strong> {user.bio || "-"}</p>
          <p><strong>Email verificado:</strong> {user.emailConfirmed ? "Si" : "No"}</p>
          <p><strong>Registrado:</strong> {new Date(user.createdAt).toLocaleString()}</p>
          <p><strong>Ultimo login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "-"}</p>
        </div>

        <div className="rounded-[28px] border border-white/70 bg-white/82 p-5 text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
          <p><strong>Estado:</strong> {user.isBlocked ? "Bloqueado" : "Activo"}</p>
          <p><strong>Forzar cambio contrasena:</strong> {user.mustChangePassword ? "Si" : "No"}</p>
          <p><strong>Roles:</strong> {user.roles.join(", ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.isBlocked ? (
              <button className="primary-button bg-emerald-600 px-3 py-2 text-xs hover:bg-emerald-700" onClick={() => action("unblock").catch((error: unknown) => setStatus(extractApiError(error)))}>Desbloquear</button>
            ) : (
              <button className="primary-button bg-rose-600 px-3 py-2 text-xs hover:bg-rose-700" onClick={() => action("block").catch((error: unknown) => setStatus(extractApiError(error)))}>Bloquear</button>
            )}
            <button className="primary-button bg-slate-900 px-3 py-2 text-xs hover:bg-slate-800" onClick={() => forceResetPassword().catch((error: unknown) => setStatus(extractApiError(error)))}>Generar temporal</button>
            <button className="primary-button bg-amber-600 px-3 py-2 text-xs hover:bg-amber-700" onClick={() => action("resend-verification").catch((error: unknown) => setStatus(extractApiError(error)))}>Reenviar verificacion</button>
            <button className="secondary-button rounded-xl px-3 py-2 text-xs" onClick={() => action("set-role", { role: "User" }).catch((error: unknown) => setStatus(extractApiError(error)))}>Rol User</button>
            <button className="secondary-button rounded-xl px-3 py-2 text-xs" onClick={() => action("set-role", { role: "Admin" }).catch((error: unknown) => setStatus(extractApiError(error)))}>Rol Admin</button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs">
            <input checked={sendTempByEmail} onChange={(event) => setSendTempByEmail(event.target.checked)} type="checkbox" />
            Enviar contrasena temporal por email al usuario
          </label>

          {lastTemporaryPassword ? (
            <div className="mt-3 rounded-[24px] border border-amber-300 bg-amber-50 p-4">
              <p className="text-xs text-amber-900">Contrasena temporal (visible una sola vez):</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{lastTemporaryPassword}</p>
              <button
                className="secondary-button mt-2 rounded-xl px-3 py-2 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(lastTemporaryPassword).then(() => {
                    setStatus("Contrasena temporal copiada.");
                  }).catch(() => {
                    setStatus("No se pudo copiar la contrasena.");
                  });
                }}
                type="button"
              >
                Copiar
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {status ? <p className="text-sm text-slate-600">{status}</p> : null}
    </section>
  );
}
