import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { useAuth } from "../../context/AuthContext";

export function LoginPage( ) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = await login(email, password);

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
    } catch {
      setError("Credenciales invalidas o usuario bloqueado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <AuthCard title="Iniciar sesion" subtitle="Accede con tu correo y contrasena temporal o definitiva">
        <form className="space-y-4" onSubmit={submit}>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Correo" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="Contrasena" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          <button className="w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <p><Link className="font-medium text-brand-700" to="/forgot-password">Olvide mi contrasena</Link></p>
          <p><Link className="font-medium text-brand-700" to="/register">Crear cuenta</Link></p>
        </div>
      </AuthCard>
    </div>
  );
}

