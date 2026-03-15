import { useState } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { authApi } from "../../lib/api";
import { AuthCard } from "../../components/AuthCard";
import { AuthShell } from "../../components/AuthShell";

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function extractApiError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "No fue posible registrar el usuario.";
  }

  const data = error.response?.data as ApiProblemResponse | undefined;
  const fieldErrors = data?.errors ? Object.values(data.errors).flat().filter(Boolean) : [];
  if (fieldErrors.length > 0) {
    return fieldErrors.join(" ");
  }

  return data?.detail ?? data?.title ?? "No fue posible registrar el usuario.";
}

export function RegisterPage( ) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    address: "",
    phone: "",
    publicAlias: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authApi.post("/auth/register", form);
      setMessage(`Cuenta creada para ${response.data.email}. Revisa tu correo para la contrasena temporal y verificaci\u00f3n.`);
    } catch (requestError: unknown) {
      setError(extractApiError(requestError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthShell title="Crear cuenta" subtitle="Registra tu usuario en Habla Mas" accent="Nuevo registro">
      <AuthCard title="Crear cuenta" subtitle="Registra tu usuario en Habla Mas">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="field-input" placeholder="Nombre" value={form.firstName} onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))} autoComplete="given-name" required />
            <input className="field-input" placeholder="Apellidos" value={form.lastName} onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))} autoComplete="family-name" required />
          </div>
          <input className="field-input" placeholder="Correo" type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} autoComplete="email" required />
          <input className="field-input" placeholder="Direccion" value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} autoComplete="street-address" required />
          <div className="grid gap-4 sm:grid-cols-[1fr_0.9fr]">
            <input className="field-input" placeholder="Telefono" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} autoComplete="tel" required />
            <input className="field-input" placeholder="Apodo publico (opcional)" value={form.publicAlias} onChange={(event) => setForm((prev) => ({ ...prev, publicAlias: event.target.value }))} autoComplete="nickname" />
          </div>
          <button disabled={saving} className="primary-button w-full" type="submit">
            {saving ? "Creando..." : "Crear cuenta"}
          </button>
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
        <p className="mt-4 text-sm text-slate-500">
          Ya tienes cuenta? <Link className="font-medium text-brand-700" to="/login">Inicia sesion</Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}

