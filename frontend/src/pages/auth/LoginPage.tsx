import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { AuthCard } from "../../components/AuthCard";
import { FaceCaptureModal } from "../../components/FaceCaptureModal";
import { AuthShell } from "../../components/AuthShell";
import { useAuth } from "../../context/AuthContext";
import type { AuthPayload } from "../../types";

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  errors?: Record<string, string[]>;
}

function extractLoginError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

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

export function LoginPage() {
  const { login, loginWithFace } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [faceModalOpen, setFaceModalOpen] = useState(false);

  const navigateAfterLogin = (payload: AuthPayload): void => {
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
      navigateAfterLogin(payload);
    } catch (requestError: unknown) {
      setError(extractLoginError(requestError));
    } finally {
      setLoading(false);
    }
  };

  const submitFaceLogin = async (file: File): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const base64Data = await fileToBase64(file);
      const payload = await loginWithFace(base64Data, file.type || "image/jpeg");
      setFaceModalOpen(false);
      navigateAfterLogin(payload);
    } catch (requestError: unknown) {
      setError(extractLoginError(requestError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      accent="Inicio de sesion"
      subtitle="Accede con tu correo y contrasena temporal o definitiva"
      title="Iniciar sesion"
    >
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
          <button className="primary-button w-full" disabled={loading} type="submit">
            {loading ? "Entrando..." : "Entrar"}
          </button>
          <button
            className="w-full rounded-2xl border border-brand-300 px-4 py-3 text-sm font-semibold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
            onClick={() => {
              setError(null);
              setFaceModalOpen(true);
            }}
            type="button"
          >
            Ingresar con reconocimiento facial
          </button>
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        </form>
        <div className="mt-4 space-y-2 text-sm text-slate-500">
          <p><Link className="font-medium text-brand-700" to="/forgot-password">Olvide mi contrasena</Link></p>
          <p><Link className="font-medium text-brand-700" to="/register">Crear cuenta</Link></p>
        </div>
      </AuthCard>
      <FaceCaptureModal
        busy={loading}
        description="Toma una selfie frontal. La app intentara identificar automaticamente el perfil que coincida con las fotos faciales guardadas."
        onCapture={submitFaceLogin}
        onClose={() => {
          if (!loading) {
            setFaceModalOpen(false);
          }
        }}
        open={faceModalOpen}
        title="Iniciar sesion con reconocimiento facial"
      />
    </AuthShell>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("No fue posible leer la foto facial."));
        return;
      }

      const [, base64 = ""] = result.split(",", 2);
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("No fue posible leer la foto facial."));
    reader.readAsDataURL(file);
  });
}
