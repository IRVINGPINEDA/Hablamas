import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { authApi } from "../../lib/api";

export function ResetPasswordPage( ) {
  const [params] = useSearchParams();
  const emailFromUrl = params.get("email") ?? "";
  const tokenFromUrl = params.get("token") ?? "";

  const [email, setEmail] = useState(emailFromUrl);
  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const prefilled = useMemo(() => Boolean(emailFromUrl && tokenFromUrl), [emailFromUrl, tokenFromUrl]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    try {
      await authApi.post("/auth/reset-password", { email, token, newPassword });
      setMessage("Contrasena actualizada. Inicia sesion nuevamente.");
    } catch {
      setError("No fue posible restablecer la contrasena.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e8eef2,_#f7f9fb_48%,_#eef2f5_100%)] px-4 py-8">
      <AuthCard title="Nueva contrasena" subtitle="Ingresa el token recibido por correo">
        <form className="space-y-4" onSubmit={submit}>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100" type="email" placeholder="Correo" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100" placeholder="Token" value={token} onChange={(event) => setToken(event.target.value)} required />
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2 transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100" type="password" placeholder="Nueva contrasena" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required minLength={10} />
          <button className="w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700" type="submit">Actualizar contrasena</button>
        </form>
        {prefilled ? <p className="mt-3 text-xs text-slate-500">Token precargado desde enlace de email.</p> : null}
        {message ? <p className="mt-3 text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </AuthCard>
    </div>
  );
}

