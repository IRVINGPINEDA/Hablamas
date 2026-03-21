import axios from "axios";
import { authApi } from "./api";

interface PushConfigResponse {
  configured: boolean;
  vapidPublicKey?: string;
}

interface PushNotificationStatus {
  supported: boolean;
  configured: boolean;
  permission: NotificationPermission;
  subscribed: boolean;
}

const SERVICE_WORKER_PATH = "/push-sw.js";

function ensureSupport(): void {
  if (!isPushNotificationsSupported()) {
    throw new Error("Tu navegador actual no soporta notificaciones push web.");
  }
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = window.atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

async function getConfig(): Promise<PushConfigResponse> {
  const response = await authApi.get("/notifications/push/config");
  return response.data as PushConfigResponse;
}

async function getExistingSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration(SERVICE_WORKER_PATH)
    || await navigator.serviceWorker.getRegistration();

  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH);
  await navigator.serviceWorker.ready;
  return registration;
}

export function isPushNotificationsSupported(): boolean {
  return typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;
}

export async function getPushNotificationStatus(): Promise<PushNotificationStatus> {
  if (!isPushNotificationsSupported()) {
    return {
      supported: false,
      configured: false,
      permission: "default",
      subscribed: false
    };
  }

  const [config, subscription] = await Promise.all([
    getConfig(),
    getExistingSubscription()
  ]);

  return {
    supported: true,
    configured: config.configured,
    permission: Notification.permission,
    subscribed: !!subscription
  };
}

export async function enablePushNotifications(): Promise<string> {
  ensureSupport();

  const config = await getConfig();
  if (!config.configured || !config.vapidPublicKey) {
    throw new Error("El servidor todavia no tiene configuradas las claves VAPID para push.");
  }

  let permission = Notification.permission;
  if (permission !== "granted") {
    permission = await Notification.requestPermission();
  }

  if (permission !== "granted") {
    throw new Error("Debes permitir las notificaciones del navegador para activarlas.");
  }

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(config.vapidPublicKey) as unknown as BufferSource
    });
  }

  const serialized = subscription.toJSON();
  if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys?.auth) {
    throw new Error("El navegador devolvio una suscripcion push incompleta.");
  }

  const response = await authApi.post("/notifications/push/subscribe", {
    endpoint: serialized.endpoint,
    keys: {
      p256Dh: serialized.keys.p256dh,
      auth: serialized.keys.auth
    }
  });

  return ((response.data as { message?: string }).message) || "Notificaciones push activadas correctamente.";
}

export async function disablePushNotifications(): Promise<string> {
  ensureSupport();

  const subscription = await getExistingSubscription();
  if (!subscription) {
    return "No habia una suscripcion push activa en este navegador.";
  }

  try {
    await authApi.post("/notifications/push/unsubscribe", {
      endpoint: subscription.endpoint
    });
  } catch {
    // best effort backend cleanup
  }

  await subscription.unsubscribe();
  return "Notificaciones push desactivadas correctamente.";
}

export function getPushNotificationErrorMessage(error: unknown, fallback: string): string {
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
