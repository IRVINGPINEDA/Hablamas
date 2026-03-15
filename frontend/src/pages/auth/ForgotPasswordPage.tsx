import { useState } from "react";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";
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
    <AuthShell title="Recuperar contrasena" subtitle="Te enviaremos un enlace de reset" accent="Recuperacion">
      <AuthCard title="Recuperar contrasena" subtitle="Te enviaremos un enlace de reset">
        <form className="space-y-4" onSubmit={submit}>
          <input className="field-input" type="email" placeholder="Correo" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
          <button className="primary-button w-full" type="submit">Enviar enlace</button>
        </form>
        {message ? <p className="mt-4 text-sm text-emerald-600">{message}</p> : null}
      </AuthCard>
    </AuthShell>
  );
}

