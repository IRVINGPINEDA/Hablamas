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
      <header className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-xl font-semibold text-slate-900">{user.firstName} {user.lastName}</h2>
        <p className="text-sm text-slate-600">{user.email}</p>
        <p className="text-xs text-slate-500">Codigo publico: {user.publicCode}</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <p><strong>Telefono:</strong> {user.phone}</p>
          <p><strong>Direccion:</strong> {user.address}</p>
          <p><strong>Bio:</strong> {user.bio || "-"}</p>
          <p><strong>Email verificado:</strong> {user.emailConfirmed ? "Si" : "No"}</p>
          <p><strong>Registrado:</strong> {new Date(user.createdAt).toLocaleString()}</p>
          <p><strong>Ultimo login:</strong> {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "-"}</p>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 text-sm">
          <p><strong>Estado:</strong> {user.isBlocked ? "Bloqueado" : "Activo"}</p>
          <p><strong>Forzar cambio contrasena:</strong> {user.mustChangePassword ? "Si" : "No"}</p>
          <p><strong>Roles:</strong> {user.roles.join(", ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {user.isBlocked ? (
              <button className="rounded bg-emerald-600 px-3 py-2 text-xs text-white" onClick={() => action("unblock").catch((error: unknown) => setStatus(extractApiError(error)))}>Desbloquear</button>
            ) : (
              <button className="rounded bg-rose-600 px-3 py-2 text-xs text-white" onClick={() => action("block").catch((error: unknown) => setStatus(extractApiError(error)))}>Bloquear</button>
            )}
            <button className="rounded bg-slate-900 px-3 py-2 text-xs text-white" onClick={() => forceResetPassword().catch((error: unknown) => setStatus(extractApiError(error)))}>Generar temporal</button>
            <button className="rounded bg-amber-600 px-3 py-2 text-xs text-white" onClick={() => action("resend-verification").catch((error: unknown) => setStatus(extractApiError(error)))}>Reenviar verificacion</button>
            <button className="rounded border border-slate-300 px-3 py-2 text-xs" onClick={() => action("set-role", { role: "User" }).catch((error: unknown) => setStatus(extractApiError(error)))}>Rol User</button>
            <button className="rounded border border-slate-300 px-3 py-2 text-xs" onClick={() => action("set-role", { role: "Admin" }).catch((error: unknown) => setStatus(extractApiError(error)))}>Rol Admin</button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs">
            <input checked={sendTempByEmail} onChange={(event) => setSendTempByEmail(event.target.checked)} type="checkbox" />
            Enviar contrasena temporal por email al usuario
          </label>

          {lastTemporaryPassword ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs text-amber-900">Contrasena temporal (visible una sola vez):</p>
              <p className="mt-1 break-all font-mono text-sm text-slate-900">{lastTemporaryPassword}</p>
              <button
                className="mt-2 rounded border border-slate-300 bg-white px-2 py-1 text-xs"
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

