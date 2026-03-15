import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { authApi } from "../../lib/api";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";

export function VerifyEmailPage( ) {
  const [params] = useSearchParams();
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("Confirma tu correo desde el enlace recibido por email.");

  const query = useMemo(() => {
    const userId = params.get("userId");
    const token = params.get("token");
    return { userId, token };
  }, [params]);

  useEffect(() => {
    if (!query.userId || !query.token) {
      return;
    }

    const verify = async () => {
      setStatus("loading");
      try {
        await authApi.get(`/auth/verify-email?userId=${encodeURIComponent(query.userId ?? "")}&token=${encodeURIComponent(query.token ?? "")}`);
        setStatus("success");
        setMessage("Correo verificado correctamente. Ya puedes iniciar sesion.");
      } catch {
        setStatus("error");
        setMessage("No fue posible verificar el correo. Solicita un nuevo enlace.");
      }
    };

    verify().catch(() => {
      setStatus("error");
      setMessage("No fue posible verificar el correo.");
    });
  }, [query.token, query.userId]);

  return (
    <AuthShell title="Verificacion de correo" subtitle="Debes confirmar tu correo antes de usar el chat" accent="Validacion de cuenta">
      <AuthCard title="Verificacion de correo" subtitle="Debes confirmar tu correo antes de usar el chat">
        <p className="text-sm text-slate-600">{message}</p>
        {status === "loading" ? <p className="mt-3 text-sm text-slate-500">Verificando...</p> : null}
        {status === "success" ? <p className="mt-3 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">Correo confirmado</p> : null}
      </AuthCard>
    </AuthShell>
  );
}

