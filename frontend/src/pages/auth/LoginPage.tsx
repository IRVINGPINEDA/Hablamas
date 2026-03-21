import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";
import { useAuth } from "../../context/AuthContext";
import { getPasskeyErrorMessage, isPasskeySupported } from "../../lib/passkeys";

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

    try {
      const payload = await login(email, password);
      completeLogin(payload);
    } catch {
      setError("Credenciales invalidas o usuario bloqueado.");
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
          <input className="field-input" placeholder="Correo" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username webauthn" required />
          <input className="field-input" placeholder="Contrasena" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
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

