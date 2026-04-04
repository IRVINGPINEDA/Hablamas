import { getAccessToken } from "./storage";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "/api";

interface ApiProblemResponse {
  title?: string;
  detail?: string;
  message?: string;
}

function buildApiUrl(path: string): string {
  if (apiBaseUrl.startsWith("http://") || apiBaseUrl.startsWith("https://")) {
    return `${apiBaseUrl.replace(/\/$/, "")}${path}`;
  }

  return `${apiBaseUrl}${path}`;
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  const binary = window.atob(`${normalized}${padding}`);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toPublicKeyDescriptor(input: {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}): PublicKeyCredentialDescriptor {
  return {
    id: decodeBase64Url(input.id),
    type: input.type,
    transports: input.transports
  };
}

function normalizeCreationOptions(input: {
  challenge: string;
  rp: PublicKeyCredentialRpEntity;
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number;
  attestation?: AttestationConveyancePreference;
  authenticatorSelection?: AuthenticatorSelectionCriteria;
  excludeCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
}): CredentialCreationOptions {
  return {
    publicKey: {
      ...input,
      challenge: decodeBase64Url(input.challenge),
      user: {
        ...input.user,
        id: decodeBase64Url(input.user.id)
      },
      excludeCredentials: input.excludeCredentials?.map(toPublicKeyDescriptor)
    }
  };
}

function normalizeRequestOptions(input: {
  challenge: string;
  timeout?: number;
  rpId?: string;
  allowCredentials?: Array<{
    id: string;
    type: PublicKeyCredentialType;
    transports?: AuthenticatorTransport[];
  }>;
  userVerification?: UserVerificationRequirement;
}): CredentialRequestOptions {
  return {
    publicKey: {
      ...input,
      challenge: decodeBase64Url(input.challenge),
      allowCredentials: input.allowCredentials?.map(toPublicKeyDescriptor)
    }
  };
}

function credentialToRegistrationPayload(credential: PublicKeyCredential): unknown {
  const response = credential.response as AuthenticatorAttestationResponse;

  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      attestationObject: encodeBase64Url(response.attestationObject)
    },
    clientExtensionResults: credential.getClientExtensionResults()
  };
}

function credentialToAuthenticationPayload(credential: PublicKeyCredential): unknown {
  const response = credential.response as AuthenticatorAssertionResponse;

  return {
    id: credential.id,
    rawId: encodeBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: encodeBase64Url(response.clientDataJSON),
      authenticatorData: encodeBase64Url(response.authenticatorData),
      signature: encodeBase64Url(response.signature),
      userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null
    },
    clientExtensionResults: credential.getClientExtensionResults()
  };
}

async function requestJson<T>(path: string, init?: RequestInit, accessToken?: string): Promise<T> {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = "No fue posible completar la operacion biometrica.";

    try {
      const error = (await response.json()) as ApiProblemResponse;
      message = error.detail || error.title || error.message || message;
    } catch {
      // ignore parse failures
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function isBiometricLoginSupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && "credentials" in navigator;
}

export async function registerBiometricPasskey(friendlyName?: string): Promise<void> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Tu sesion expiro. Inicia sesion otra vez.");
  }

  if (!isBiometricLoginSupported()) {
    throw new Error("Este dispositivo o navegador no soporta acceso biometrico web.");
  }

  const creationOptions = await requestJson<{
    challenge: string;
    rp: PublicKeyCredentialRpEntity;
    user: { id: string; name: string; displayName: string };
    pubKeyCredParams: PublicKeyCredentialParameters[];
    timeout?: number;
    attestation?: AttestationConveyancePreference;
    authenticatorSelection?: AuthenticatorSelectionCriteria;
    excludeCredentials?: Array<{
      id: string;
      type: PublicKeyCredentialType;
      transports?: AuthenticatorTransport[];
    }>;
  }>("/auth/passkeys/register/options", { method: "POST", body: "{}" }, accessToken);

  const credential = (await navigator.credentials.create(
    normalizeCreationOptions(creationOptions)
  )) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("No se pudo crear el acceso biometrico.");
  }

  await requestJson("/auth/passkeys/register/verify", {
    method: "POST",
    body: JSON.stringify({
      friendlyName,
      credential: credentialToRegistrationPayload(credential)
    })
  }, accessToken);
}

export async function authenticateWithBiometricPasskey(email: string): Promise<{
  accessToken: string;
  refreshToken: string;
  mustChangePassword: boolean;
  emailConfirmed: boolean;
  userId: string;
  email: string;
  publicAlias: string;
  roles: string[];
}> {
  if (!isBiometricLoginSupported()) {
    throw new Error("Este dispositivo o navegador no soporta acceso biometrico web.");
  }

  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    throw new Error("Escribe tu correo para ubicar tu acceso biometrico.");
  }

  const optionsResponse = await requestJson<{
    operationId: string;
    publicKey: {
      challenge: string;
      timeout?: number;
      rpId?: string;
      allowCredentials?: Array<{
        id: string;
        type: PublicKeyCredentialType;
        transports?: AuthenticatorTransport[];
      }>;
      userVerification?: UserVerificationRequirement;
    };
  }>("/auth/passkeys/authenticate/options", {
    method: "POST",
    body: JSON.stringify({ email: trimmedEmail })
  });

  const credential = (await navigator.credentials.get(
    normalizeRequestOptions(optionsResponse.publicKey)
  )) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("No se pudo validar tu acceso biometrico.");
  }

  return requestJson("/auth/passkeys/authenticate/verify", {
    method: "POST",
    body: JSON.stringify({
      operationId: optionsResponse.operationId,
      credential: credentialToAuthenticationPayload(credential)
    })
  });
}
