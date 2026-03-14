import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function extractApiError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "No fue posible cambiar la contrasena.";
  }

  const data = error.response?.data as ApiProblemResponse | undefined;
  const fieldErrors = data?.errors ? Object.values(data.errors).flat().filter(Boolean) : [];

  if (fieldErrors.length > 0) {
    return fieldErrors.join(" ");
  }

  if (data?.detail) {
    return data.detail;
  }

  if (data?.title) {
    return data.title;
  }

  return "No fue posible cambiar la contrasena.";
}

const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,128}$/;

export function ChangePasswordPage( ) {
  const { refreshProfile, user, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (newPassword !== confirmNewPassword) {
      setError("La nueva contrasena y su confirmacion no coinciden.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("La nueva contrasena debe ser diferente a la actual.");
      return;
    }

    if (!strongPasswordRegex.test(newPassword)) {
      setError("La nueva contrasena debe tener minimo 10 caracteres, mayuscula, minuscula, numero y simbolo.");
      return;
    }

    try {
      await authApi.post("/auth/change-temporary-password", {
        currentPassword,
        newPassword
      });

      await refreshProfile();
      setMessage("Contrasena actualizada correctamente.");

      if (user?.roles.includes("Admin")) {
        navigate("/admin", { replace: true });
      } else {
        navigate("/app", { replace: true });
      }
    } catch (requestError: unknown) {
      setError(extractApiError(requestError));
    }
  };

  return (
    <AuthShell title="Cambiar contrasena" subtitle="Debes actualizar tu contrasena temporal para continuar" accent="Seguridad obligatoria">
      <AuthCard title="Cambiar contrasena" subtitle="Debes actualizar tu contrasena temporal para continuar">
        <form className="space-y-4" onSubmit={submit}>
          <input className="field-input" type="password" placeholder="Contrasena actual" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
          <input className="field-input" type="password" placeholder="Nueva contrasena" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
          <input className="field-input" type="password" placeholder="Confirmar nueva contrasena" value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} autoComplete="new-password" minLength={10} required />
          <p className="text-xs text-slate-500">Reglas: minimo 10 caracteres, una mayuscula, una minuscula, un numero y un simbolo.</p>
          <button className="primary-button w-full" type="submit">Cambiar contrasena</button>
        </form>
        {message ? <p className="mt-3 text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="mt-3 whitespace-pre-line text-sm text-rose-600">{error}</p> : null}
        <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
          <Link className="font-medium text-brand-700" to="/forgot-password">Olvide mi contrasena</Link>
          <button
            className="secondary-button rounded-xl px-3 py-2 text-xs"
            onClick={() => {
              logout().then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true }));
            }}
            type="button"
          >
            Cerrar sesion
          </button>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

