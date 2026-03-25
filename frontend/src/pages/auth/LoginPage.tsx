import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { getPasskeyErrorMessage, isPasskeySupported } from "../../lib/passkeys";

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function extractLoginError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "No fue posible iniciar sesion.";
  }

  if (!error.response) {
    return "No se pudo conectar al servidor. Si estas en telefono, verifica que la app y la API sean accesibles desde esa red.";
  }

  const data = error.response.data as ApiProblemResponse | undefined;
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

  return "Credenciales invalidas o usuario bloqueado.";
}

export function LoginPage( ) {
  const { login, loginWithPasskey } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const passkeyAvailable = isPasskeySupported();

  const completeLogin = (payload: { mustChangePassword: boolean; emailConfirmed: boolean; roles: string[] }) => {
    if (payload.mustChangePassword) {
      navigate("/change-password", { replace: true });
      return;
    }

    if (!payload.emailConfirmed) {
      navigate("/verify-email", { replace: true });
      return;
    }

    if (payload.roles.includes("Admin")) {
      navigate("/admin", { replace: true });
      return;
    }

    navigate("/app", { replace: true });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const emailValue = String(formData.get("email") ?? email).trim();
    const passwordValue = String(formData.get("password") ?? password);

    if (!emailValue || !passwordValue) {
      setLoading(false);
      setError("Ingresa correo y contrasena.");
      return;
    }

    try {
      const payload = await login(emailValue, passwordValue);

      if (payload.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }

      if (!payload.emailConfirmed) {
        navigate("/verify-email", { replace: true });
        return;
      }

      if (payload.roles.includes("Admin")) {
        navigate("/admin", { replace: true });
        return;
      }

      navigate("/app", { replace: true });
    } catch (requestError: unknown) {
      setError(extractLoginError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const signInWithPasskey = async () => {
    setPasskeyLoading(true);
    setError(null);

    try {
      const payload = await loginWithPasskey(email);
      completeLogin(payload);
    } catch (requestError: unknown) {
      setError(getPasskeyErrorMessage(requestError, "No fue posible iniciar sesion con clave segura."));
    } finally {
      setPasskeyLoading(false);
    }
  };

  return (
    <AuthShell title="Iniciar sesion" subtitle="Accede con tu correo y contrasena temporal o definitiva" accent="Inicio de sesion">
      <AuthCard title="Iniciar sesion" subtitle="Accede con tu correo y contrasena temporal o definitiva">
        <form className="space-y-4" onSubmit={submit}>
          <input
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect="off"
            className="field-input"
            inputMode="email"
            name="email"
            placeholder="Correo"
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            autoCapitalize="none"
            autoComplete="current-password"
            autoCorrect="off"
            className="field-input"
            name="password"
            placeholder="Contrasena"
            required
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button className="primary-button w-full" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {passkeyAvailable ? (
            <button className="secondary-button w-full" type="button" onClick={() => { signInWithPasskey().catch(() => undefined); }} disabled={passkeyLoading}>
              {passkeyLoading ? "Abriendo clave segura..." : "Iniciar sesion con clave segura"}
            </button>
          ) : (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Las claves seguras requieren un navegador compatible y contexto seguro HTTPS.
            </p>
          )}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <p>Si escribes tu correo antes, el navegador priorizara las passkeys de esa cuenta.</p>
          <p><Link className="font-medium text-brand-700" to="/forgot-password">Olvide mi contrasena</Link></p>
          <p><Link className="font-medium text-brand-700" to="/register">Crear cuenta</Link></p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

