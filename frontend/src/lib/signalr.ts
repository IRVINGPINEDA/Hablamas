import { HubConnection, HubConnectionBuilder, LogLevel } from "@microsoft/signalr";
import { getAccessToken } from "./storage";

export function createChatConnection(): HubConnection {
  const rawHubUrl = import.meta.env.VITE_HUB_URL || "/hubs/chat";
  const absoluteHubUrl =
    rawHubUrl.startsWith("http://") || rawHubUrl.startsWith("https://")
      ? rawHubUrl
      : `${window.location.origin}${rawHubUrl}`;

  return new HubConnectionBuilder()
    .withUrl(absoluteHubUrl, {
      accessTokenFactory: () => getAccessToken() || ""
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build();
}
