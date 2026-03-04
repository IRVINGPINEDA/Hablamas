import { useState } from "react";
import { AuthCard } from "../../components/AuthCard";
import { authApi } from "../../lib/api";

export function ForgotPasswordPage( ) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await authApi.post("/auth/forgot-password", { email });
    setMessage("Si el correo existe, se envio un enlace de recuperacion.");
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <AuthCard title="Recuperar contrasena" subtitle="Te enviaremos un enlace de reset">
        <form className="space-y-4" onSubmit={submit}>
          <input className="w-full rounded-lg border border-slate-300 px-3 py-2" type="email" placeholder="Correo" value={email} onChange={(event) => setEmail(event.target.value)} required />
          <button className="w-full rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700" type="submit">Enviar enlace</button>
        </form>
        {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}
      </AuthCard>
    </div>
  );
}

