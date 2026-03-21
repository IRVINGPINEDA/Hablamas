import axios from "axios";
import { authApi } from "./api";
import type { AuthPayload, PasskeyCredentialSummary } from "../types";

interface PasskeyOperationResponse {
  operationId: string;
  options: Record<string, unknown>;
}

function ensurePasskeySupport(): void {
  if (typeof window === "undefined" || !window.isSecureContext || typeof navigator === "undefined" || !navigator.credentials || !("PublicKeyCredential" in window)) {
    throw new Error("Tu navegador o contexto actual no soporta claves seguras.");
  }
}

function base64UrlToBuffer(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer | null | undefined): string | null {
  if (!buffer) {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function mapDescriptor(descriptor: Record<string, unknown>): PublicKeyCredentialDescriptor {
  return {
    ...descriptor,
    id: base64UrlToBuffer(String(descriptor.id))
  } as PublicKeyCredentialDescriptor;
}

function mapCreationOptions(options: Record<string, unknown>): PublicKeyCredentialCreationOptions {
  const publicKey = options as {
    challenge: string;
    user: Record<string, unknown> & { id: string };
    excludeCredentials?: Record<string, unknown>[];
  };

  return {
    ...publicKey,
    challenge: base64UrlToBuffer(publicKey.challenge),
    user: {
      ...publicKey.user,
      id: base64UrlToBuffer(publicKey.user.id)
    },
    excludeCredentials: (publicKey.excludeCredentials ?? []).map(mapDescriptor)
  } as PublicKeyCredentialCreationOptions;
}

function mapRequestOptions(options: Record<string, unknown>): PublicKeyCredentialRequestOptions {
  const publicKey = options as {
    challenge: string;
    allowCredentials?: Record<string, unknown>[];
  };

  return {
    ...publicKey,
    challenge: base64UrlToBuffer(publicKey.challenge),
    allowCredentials: (publicKey.allowCredentials ?? []).map(mapDescriptor)
  } as PublicKeyCredentialRequestOptions;
}

function serializeAttestationCredential(credential: Credential): Record<string, unknown> {
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("La respuesta del navegador no es una credencial valida.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      attestationObject: bufferToBase64Url(response.attestationObject),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      transports: typeof response.getTransports === "function" ? response.getTransports() : undefined
    }
  };
}

function serializeAssertionCredential(credential: Credential): Record<string, unknown> {
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("La respuesta del navegador no es una credencial valida.");
  }

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment ?? undefined,
    clientExtensionResults: credential.getClientExtensionResults(),
    response: {
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      signature: bufferToBase64Url(response.signature),
      userHandle: bufferToBase64Url(response.userHandle)
    }
  };
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials &&
    "PublicKeyCredential" in window;
}

export function getPasskeyErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "La operacion fue cancelada o expiro.";
    }

    if (error.name === "InvalidStateError") {
      return "Esta clave segura ya estaba registrada en este equipo.";
    }

    if (error.name === "SecurityError") {
      return "El navegador rechazo la operacion por seguridad u origen invalido.";
    }
  }

  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string; title?: string } | undefined)?.detail;
    const title = (error.response?.data as { detail?: string; title?: string } | undefined)?.title;
    return detail || title || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function beginPasskeyLogin(email?: string): Promise<AuthPayload> {
  ensurePasskeySupport();

  const optionsResponse = await authApi.post("/auth/passkeys/login/options", {
    email: email?.trim() || undefined
  });

  const { operationId, options } = optionsResponse.data as PasskeyOperationResponse;
  const credential = await navigator.credentials.get({
    publicKey: mapRequestOptions(options)
  });

  if (!credential) {
    throw new Error("No se obtuvo una respuesta valida de la clave segura.");
  }

  const verifyResponse = await authApi.post("/auth/passkeys/login/verify", {
    operationId,
    credential: serializeAssertionCredential(credential)
  });

  return verifyResponse.data as AuthPayload;
}

export async function registerCurrentPasskey(deviceName?: string): Promise<string> {
  ensurePasskeySupport();

  const optionsResponse = await authApi.post("/auth/passkeys/register/options", {
    deviceName: deviceName?.trim() || undefined
  });

  const { operationId, options } = optionsResponse.data as PasskeyOperationResponse;
  const credential = await navigator.credentials.create({
    publicKey: mapCreationOptions(options)
  });

  if (!credential) {
    throw new Error("No se pudo crear la clave segura.");
  }

  const verifyResponse = await authApi.post("/auth/passkeys/register/verify", {
    operationId,
    deviceName: deviceName?.trim() || undefined,
    authenticatorAttachment: credential instanceof PublicKeyCredential ? credential.authenticatorAttachment ?? undefined : undefined,
    credential: serializeAttestationCredential(credential)
  });

  return ((verifyResponse.data as { message?: string }).message) || "Clave segura registrada correctamente.";
}

export async function fetchPasskeyCredentials(): Promise<PasskeyCredentialSummary[]> {
  const response = await authApi.get("/auth/passkeys/credentials");
  return response.data as PasskeyCredentialSummary[];
}

export async function removePasskeyCredential(passkeyId: string): Promise<string> {
  const response = await authApi.delete(`/auth/passkeys/credentials/${passkeyId}`);
  return ((response.data as { message?: string }).message) || "Clave segura eliminada correctamente.";
}
