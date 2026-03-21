import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { HubConnection, HubConnectionState } from "@microsoft/signalr";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";
import { fetchPasskeyCredentials, getPasskeyErrorMessage, isPasskeySupported, registerCurrentPasskey, removePasskeyCredential } from "../../lib/passkeys";
import { disablePushNotifications, enablePushNotifications, getPushNotificationErrorMessage, getPushNotificationStatus, isPushNotificationsSupported } from "../../lib/pushNotifications";
import { createChatConnection } from "../../lib/signalr";
import type {
  ChatAttachmentDto,
  ChatMessageType,
  ContactDto,
  ConversationSummary,
  GroupChatSummary,
  GroupMemberDto,
  GroupMessageDto,
  MessageDto,
  PasskeyCredentialSummary
} from "../../types";

interface ProfileForm {
  bio: string;
  publicAlias: string;
  theme: number;
  accentColor: string;
}

interface UploadedAttachment {
  url: string;
  messageType: Exclude<ChatMessageType, "text">;
  attachmentName?: string;
  attachmentContentType?: string;
  attachmentSizeBytes?: number;
}

type ChatRenderableMessage = Pick<MessageDto, "id" | "type" | "text" | "imageUrl" | "attachmentUrl" | "attachmentName" | "attachmentContentType" | "attachmentSizeBytes" | "createdAt">;

type Panel = "chats" | "groups" | "contacts" | "profile";


const panelLabels: Record<Panel, string> = {
  chats: "Chats",
  groups: "Grupos",
  contacts: "Contactos",
  profile: "Perfil"
};

const MESSAGE_WRAP_LENGTH = 50;
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.rar,.rtf";

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function wrapMessageText(text?: string): string {
  if (!text) {
    return "";
  }

  return text
    .split("\n")
    .map((line) => {
      if (line.length <= MESSAGE_WRAP_LENGTH) {
        return line;
      }

      const chunks: string[] = [];
      for (let index = 0; index < line.length; index += MESSAGE_WRAP_LENGTH) {
        chunks.push(line.slice(index, index + MESSAGE_WRAP_LENGTH));
      }

      return chunks.join("\n");
    })
    .join("\n");
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) {
    return "";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatRelativeDate(value?: string): string {
  if (!value) {
    return "Aun no se ha usado";
  }

  const date = new Date(value);
  return date.toLocaleString("es-MX", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function getVoiceExtension(contentType: string): string {
  if (contentType.includes("ogg")) {
    return ".ogg";
  }

  if (contentType.includes("mp4")) {
    return ".m4a";
  }

  if (contentType.includes("wav")) {
    return ".wav";
  }

  return ".webm";
}

function getAttachmentUrl(message: ChatAttachmentDto): string | undefined {
  return message.attachmentUrl || message.imageUrl;
}

function getMessagePreview(message?: { type: ChatMessageType; text?: string; attachmentName?: string }): string {
  if (!message) {
    return "Sin mensajes";
  }

  if (message.type === "text") {
    return message.text || "Sin mensajes";
  }

  if (message.type === "image") {
    return "[imagen]";
  }

  if (message.type === "video") {
    return "[video]";
  }

  if (message.type === "audio") {
    return "[nota de voz]";
  }

  return message.attachmentName ? `[archivo] ${message.attachmentName}` : "[archivo]";
}

export function AppPage( ) {
  const { user, logout, refreshProfile } = useAuth();
  const [panel, setPanel] = useState<Panel>("chats");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [groupChats, setGroupChats] = useState<GroupChatSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupMessageDto[]>([]);
  const [groupMembers, setGroupMembers] = useState<GroupMemberDto[]>([]);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string>>({});
  const [presenceByUser, setPresenceByUser] = useState<Record<string, boolean>>({});
  const [messageInput, setMessageInput] = useState("");
  const [connectionState, setConnectionState] = useState<HubConnectionState>(HubConnectionState.Disconnected);
  const [addingCode, setAddingCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>({
    bio: "",
    publicAlias: "",
    theme: 1,
    accentColor: "#5f7888"
  });
  const [passkeys, setPasskeys] = useState<PasskeyCredentialSummary[]>([]);
  const [newPasskeyName, setNewPasskeyName] = useState("");
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyRemovingId, setPasskeyRemovingId] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [statusText, setStatusText] = useState<string | null>(null);
  const passkeyAvailable = isPasskeySupported();
  const pushSupported = isPushNotificationsSupported();
  const selectedConversationRef = useRef<string | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const contactsRef = useRef<ContactDto[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);

  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  const currentGroup = useMemo(
    () => groupChats.find((group) => group.id === selectedGroupId) ?? null,
    [groupChats, selectedGroupId]
  );

  const onlineContacts = useMemo(
    () => contacts.filter((contact) => presenceByUser[contact.contactUser.id]).length,
    [contacts, presenceByUser]
  );

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const loadSidebar = async (): Promise<void> => {
    const [chatsResponse, contactsResponse] = await Promise.all([
      authApi.get("/chats"),
      authApi.get("/contacts")
    ]);

    const loadedConversations = chatsResponse.data as ConversationSummary[];
    const loadedContacts = contactsResponse.data as ContactDto[];

    setConversations(loadedConversations);
    setContacts(loadedContacts);

    if (!selectedConversationRef.current && loadedConversations.length > 0) {
      setSelectedConversationId(loadedConversations[0].id);
    }
  };

  const loadGroups = async (): Promise<void> => {
    const response = await authApi.get("/group-chats");
    const groups = response.data as GroupChatSummary[];
    setGroupChats(groups);
    if (!selectedGroupId && groups.length > 0) {
      setSelectedGroupId(groups[0].id);
    }
  };

  const loadProfile = async (): Promise<void> => {
    const response = await authApi.get("/profile/me");
    setProfile({
      bio: response.data.bio ?? "",
      publicAlias: response.data.publicAlias ?? "",
      theme: response.data.theme,
      accentColor: response.data.accentColor ?? "#5f7888"
    });
  };

  const loadPasskeys = async (): Promise<void> => {
    const credentials = await fetchPasskeyCredentials();
    setPasskeys(credentials);
  };

  const loadPushStatus = async (): Promise<void> => {
    const status = await getPushNotificationStatus();
    setPushConfigured(status.configured);
    setPushEnabled(status.subscribed);
    setPushPermission(status.permission);
  };

  const loadMessages = async (conversationId: string): Promise<void> => {
    const response = await authApi.get(`/chats/${conversationId}/messages?page=1&pageSize=70`);
    const items = response.data.items as MessageDto[];
    setMessages(items);

    const last = items[items.length - 1];
    if (last) {
      await authApi.post(`/chats/${conversationId}/mark-seen`, { lastSeenMessageId: last.id });
      const connection = connectionRef.current;
      if (connection && connection.state === HubConnectionState.Connected) {
        await connection.invoke("MarkSeen", conversationId, last.id);
      }
    }
  };

  const loadGroupMessages = async (groupId: string): Promise<void> => {
    const response = await authApi.get(`/group-chats/${groupId}/messages?page=1&pageSize=100`);
    setGroupMessages(response.data.items as GroupMessageDto[]);
  };

  const loadGroupMembers = async (groupId: string): Promise<void> => {
    const response = await authApi.get(`/group-chats/${groupId}/members`);
    setGroupMembers(response.data as GroupMemberDto[]);
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    Promise.all([loadSidebar(), loadGroups(), loadProfile(), loadPasskeys(), loadPushStatus()]).catch(() => {
      setStatusText("No fue posible cargar la aplicacion.");
    });
  }, [user]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedConversationId).catch(() => {
      setStatusText("No fue posible cargar mensajes privados.");
    });
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedGroupId) {
      setGroupMessages([]);
      setGroupMembers([]);
      return;
    }

    Promise.all([loadGroupMessages(selectedGroupId), loadGroupMembers(selectedGroupId)]).catch(() => {
      setStatusText("No fue posible cargar el grupo.");
    });
  }, [selectedGroupId]);

  useEffect(() => {
    if (panel !== "groups" || !selectedGroupId) {
      return;
    }

    const timer = window.setInterval(() => {
      loadGroupMessages(selectedGroupId).catch(() => undefined);
      loadGroups().catch(() => undefined);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [panel, selectedGroupId]);

  useEffect(() => {
    if (!user || !user.emailConfirmed || user.mustChangePassword) {
      return;
    }

    const connection = createChatConnection();
    connectionRef.current = connection;

    connection.on("message:new", (payload: { conversationId: string; message: MessageDto }) => {
      setConversations((prev) => {
        const existing = prev.find((item) => item.id === payload.conversationId);
        if (!existing) {
          return prev;
        }

        const next = prev.map((item) =>
          item.id === payload.conversationId
            ? {
                ...item,
                lastMessageAt: payload.message.createdAt,
                lastMessage: {
                  id: payload.message.id,
                  text: payload.message.text,
                  type: payload.message.type,
                  imageUrl: payload.message.imageUrl,
                  attachmentUrl: payload.message.attachmentUrl,
                  attachmentName: payload.message.attachmentName,
                  attachmentContentType: payload.message.attachmentContentType,
                  attachmentSizeBytes: payload.message.attachmentSizeBytes,
                  senderId: payload.message.senderId,
                  createdAt: payload.message.createdAt
                }
              }
            : item
        );

        return [...next].sort((a, b) => (b.lastMessageAt ?? b.createdAt).localeCompare(a.lastMessageAt ?? a.createdAt));
      });

      if (selectedConversationRef.current === payload.conversationId) {
        setMessages((prev) => {
          const alreadyExists = prev.some((message) => message.id === payload.message.id);
          if (alreadyExists) {
            return prev;
          }
          return [...prev, payload.message];
        });
      }
    });

    connection.on("message:status", (payload: { messageId?: string; status: "Sent" | "Delivered" | "Seen"; conversationId: string }) => {
      if (selectedConversationRef.current !== payload.conversationId) {
        return;
      }

      setMessages((prev) => {
        if (payload.messageId) {
          return prev.map((message) =>
            message.id === payload.messageId ? { ...message, status: payload.status } : message
          );
        }

        return prev.map((message) =>
          message.senderId === user.id ? { ...message, status: payload.status } : message
        );
      });
    });

    connection.on("typing:update", (payload: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (!payload.isTyping) {
        setTypingByConversation((prev) => {
          const copy = { ...prev };
          delete copy[payload.conversationId];
          return copy;
        });
        return;
      }

      const contact = contactsRef.current.find((item) => item.contactUser.id === payload.userId);
      setTypingByConversation((prev) => ({
        ...prev,
        [payload.conversationId]: contact?.alias || contact?.contactUser.publicAlias || "Escribiendo"
      }));
    });

    connection.on("presence:update", (payload: { userId: string; online: boolean }) => {
      setPresenceByUser((prev) => ({
        ...prev,
        [payload.userId]: payload.online
      }));
    });

    const connect = async () => {
      try {
        await connection.start();
        setConnectionState(connection.state);

        if (selectedConversationRef.current) {
          await connection.invoke("JoinConversation", selectedConversationRef.current);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("before stop() was called")) {
          return;
        }
        setStatusText("No fue posible iniciar mensajeria en tiempo real.");
      }
    };

    connect().catch(() => {
      setStatusText("No fue posible iniciar mensajeria en tiempo real.");
    });

    return () => {
      if (connection.state !== HubConnectionState.Disconnected) {
        connection.stop().catch(() => undefined);
      }
      setConnectionState(HubConnectionState.Disconnected);
    };
  }, [user]);

  useEffect(() => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected || !selectedConversationId) {
      return;
    }

    connection.invoke("JoinConversation", selectedConversationId).catch(() => {
      setStatusText("No se pudo unir a la conversacion privada.");
    });
  }, [selectedConversationId]);

  const sendDirectText = async (text: string): Promise<void> => {
    if (!selectedConversationId) {
      return;
    }

    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      setStatusText("SignalR no conectado.");
      return;
    }

    await connection.invoke("SendText", selectedConversationId, crypto.randomUUID(), text);
  };

  const sendGroupText = async (text: string): Promise<void> => {
    if (!selectedGroupId) {
      return;
    }

    await authApi.post(`/group-chats/${selectedGroupId}/messages`, {
      type: "text",
      text,
      clientMessageId: crypto.randomUUID()
    });

    await Promise.all([loadGroupMessages(selectedGroupId), loadGroups()]);
  };

  const sendText = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!messageInput.trim()) {
      return;
    }

    const text = messageInput.trim();
    setMessageInput("");

    if (panel === "groups") {
      await sendGroupText(text);
      return;
    }

    await sendDirectText(text);
  };

  const sendTyping = async (isTyping: boolean): Promise<void> => {
    if (!selectedConversationId || panel !== "chats") {
      return;
    }

    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      return;
    }

    await connection.invoke("SendTyping", selectedConversationId, isTyping);
  };

  const uploadAttachment = async (file: File): Promise<UploadedAttachment> => {
    const formData = new FormData();
    formData.append("file", file);

    const response = await authApi.post("/uploads/message-attachment", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    return response.data as UploadedAttachment;
  };

  const sendUploadedAttachment = async (attachment: UploadedAttachment): Promise<void> => {
    const clientMessageId = crypto.randomUUID();

    if (panel === "groups") {
      if (!selectedGroupId) {
        return;
      }

      await authApi.post(`/group-chats/${selectedGroupId}/messages`, {
        type: attachment.messageType,
        imageUrl: attachment.messageType === "image" ? attachment.url : undefined,
        attachmentUrl: attachment.url,
        attachmentName: attachment.attachmentName,
        attachmentContentType: attachment.attachmentContentType,
        attachmentSizeBytes: attachment.attachmentSizeBytes,
        clientMessageId
      });

      await Promise.all([loadGroupMessages(selectedGroupId), loadGroups()]);
      return;
    }

    if (!selectedConversationId) {
      return;
    }

    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      setStatusText("SignalR no conectado.");
      return;
    }

    await connection.invoke(
      "SendAttachment",
      selectedConversationId,
      clientMessageId,
      attachment.messageType,
      attachment.url,
      attachment.attachmentName ?? null,
      attachment.attachmentContentType ?? null,
      attachment.attachmentSizeBytes ?? null
    );
  };

  const sendAttachment = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const uploaded = await uploadAttachment(file);
      await sendUploadedAttachment(uploaded);
      setStatusText("Adjunto enviado.");
    } finally {
      event.target.value = "";
    }
  };

  const toggleVoiceRecording = async (): Promise<void> => {
    if (isRecordingVoice) {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        setStatusText("Procesando nota de voz...");
        recorder.stop();
      }
      return;
    }

    if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatusText("Tu navegador no soporta notas de voz.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    voiceChunksRef.current = [];

    const supportedMimeType = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4"
    ].find((type) => MediaRecorder.isTypeSupported(type));

    const recorder = supportedMimeType
      ? new MediaRecorder(stream, { mimeType: supportedMimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        voiceChunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      voiceChunksRef.current = [];
      setIsRecordingVoice(false);
      setStatusText("No fue posible grabar la nota de voz.");
    };

    recorder.onstop = () => {
      const contentType = recorder.mimeType || "audio/webm";
      const blob = new Blob(voiceChunksRef.current, { type: contentType });

      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      voiceChunksRef.current = [];
      setIsRecordingVoice(false);

      if (blob.size === 0) {
        setStatusText("No se capturo audio.");
        return;
      }

      const voiceFile = new File(
        [blob],
        `nota-de-voz-${Date.now()}${getVoiceExtension(contentType)}`,
        { type: contentType }
      );

      uploadAttachment(voiceFile)
        .then(sendUploadedAttachment)
        .then(() => setStatusText("Nota de voz enviada."))
        .catch(() => {
          setStatusText("No fue posible enviar la nota de voz.");
        });
    };

    recorder.start(250);
    mediaRecorderRef.current = recorder;
    setIsRecordingVoice(true);
    setStatusText("Grabando nota de voz...");
  };

  const addContactByCode = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!addingCode.trim()) {
      return;
    }

    await authApi.post("/contacts/add-by-code", { publicCode: addingCode.trim() });
    setAddingCode("");
    await loadSidebar();
    setStatusText("Contacto agregado.");
  };

  const updateAlias = async (contactId: string, alias: string): Promise<void> => {
    await authApi.patch(`/contacts/${contactId}/alias`, { alias });
    await loadSidebar();
  };

  const toggleGroupMember = (contactUserId: string): void => {
    setSelectedGroupMemberIds((prev) =>
      prev.includes(contactUserId)
        ? prev.filter((id) => id !== contactUserId)
        : [...prev, contactUserId]
    );
  };

  const createGroup = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!newGroupName.trim()) {
      return;
    }

    const response = await authApi.post("/group-chats", {
      name: newGroupName.trim(),
      memberUserIds: selectedGroupMemberIds
    });

    setNewGroupName("");
    setSelectedGroupMemberIds([]);
    await loadGroups();
    setSelectedGroupId(response.data.id as string);
    setPanel("groups");
    setStatusText("Grupo creado.");
  };

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    await authApi.put("/profile/me", profile);
    await refreshProfile();
    setStatusText("Perfil actualizado.");
  };

  const createPasskey = async (): Promise<void> => {
    setPasskeyBusy(true);

    try {
      const message = await registerCurrentPasskey(newPasskeyName);
      setNewPasskeyName("");
      await Promise.all([loadPasskeys(), refreshProfile()]);
      setStatusText(message);
    } catch (error: unknown) {
      setStatusText(getPasskeyErrorMessage(error, "No fue posible registrar la clave segura."));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const deletePasskey = async (passkeyId: string): Promise<void> => {
    setPasskeyRemovingId(passkeyId);

    try {
      const message = await removePasskeyCredential(passkeyId);
      await Promise.all([loadPasskeys(), refreshProfile()]);
      setStatusText(message);
    } catch (error: unknown) {
      setStatusText(getPasskeyErrorMessage(error, "No fue posible eliminar la clave segura."));
    } finally {
      setPasskeyRemovingId(null);
    }
  };

  const activatePush = async (): Promise<void> => {
    setPushBusy(true);

    try {
      const message = await enablePushNotifications();
      await loadPushStatus();
      setStatusText(message);
    } catch (error: unknown) {
      setStatusText(getPushNotificationErrorMessage(error, "No fue posible activar las notificaciones push."));
    } finally {
      setPushBusy(false);
    }
  };

  const deactivatePush = async (): Promise<void> => {
    setPushBusy(true);

    try {
      const message = await disablePushNotifications();
      await loadPushStatus();
      setStatusText(message);
    } catch (error: unknown) {
      setStatusText(getPushNotificationErrorMessage(error, "No fue posible desactivar las notificaciones push."));
    } finally {
      setPushBusy(false);
    }
  };

  const uploadProfileImage = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    await authApi.post("/profile/image", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    await refreshProfile();
    setStatusText("Foto de perfil actualizada.");
  };

  const renderMessageContent = (message: ChatRenderableMessage) => {
    const attachmentUrl = getAttachmentUrl(message);

    if (message.type === "image" && attachmentUrl) {
      return (
        <a href={attachmentUrl} target="_blank" rel="noreferrer" className="block">
          <img alt={message.attachmentName || "Imagen"} className="h-auto max-h-64 w-auto max-w-[220px] rounded-xl object-cover sm:max-w-[320px]" src={attachmentUrl} />
        </a>
      );
    }

    if (message.type === "video" && attachmentUrl) {
      return (
        <video
          controls
          className="h-auto max-h-72 w-auto max-w-[240px] rounded-xl bg-black sm:max-w-[360px]"
          preload="metadata"
          src={attachmentUrl}
        />
      );
    }

    if (message.type === "audio" && attachmentUrl) {
      return (
        <div className="min-w-[220px] max-w-[320px] space-y-2">
          <p className="text-xs font-medium">{message.attachmentName || "Nota de voz"}</p>
          <audio controls className="w-full" preload="metadata" src={attachmentUrl} />
          {message.attachmentSizeBytes ? <p className="text-[11px] opacity-80">{formatBytes(message.attachmentSizeBytes)}</p> : null}
        </div>
      );
    }

    if (message.type === "file" && attachmentUrl) {
      return (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noreferrer"
          className="block min-w-[220px] max-w-[320px] rounded-xl border border-current/15 bg-black/5 px-4 py-3 no-underline"
        >
          <p className="text-xs uppercase tracking-wide opacity-70">Archivo</p>
          <p className="mt-1 break-words font-medium">{message.attachmentName || "Descargar archivo"}</p>
          <p className="mt-1 text-[11px] opacity-80">
            {[message.attachmentContentType, formatBytes(message.attachmentSizeBytes)].filter(Boolean).join(" | ")}
          </p>
        </a>
      );
    }

    return <p className="whitespace-pre-wrap break-words">{wrapMessageText(message.text)}</p>;
  };

  const renderChatMain = () => {
    if (!currentConversation) {
      return (
        <div className="m-auto max-w-md text-center text-slate-500">
          <p className="eyebrow-label">Mensajeria privada</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">Selecciona una conversacion</p>
          <p className="mt-2 text-sm leading-6">Agrega contactos para comenzar o cambia al panel de contactos para organizar tus alias.</p>
        </div>
      );
    }

    return (
      <>
        <header className="border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                {currentConversation.contact.profileImageUrl ? (
                  <img
                    alt={currentConversation.contact.alias || currentConversation.contact.publicAlias}
                    className="h-14 w-14 rounded-full object-cover ring-2 ring-white"
                    src={currentConversation.contact.profileImageUrl}
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700 ring-2 ring-white">
                    {getInitials(currentConversation.contact.alias || currentConversation.contact.publicAlias)}
                  </div>
                )}
                <span
                  className={clsx(
                    "absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white",
                    presenceByUser[currentConversation.contact.id] ? "bg-emerald-500" : "bg-slate-300"
                  )}
                />
              </div>

              <div>
                <p className="eyebrow-label">Chat privado</p>
                <h2 className="mt-2 text-xl font-bold text-slate-950">{currentConversation.contact.alias || currentConversation.contact.publicAlias}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className={clsx("rounded-full px-2.5 py-1 font-semibold", presenceByUser[currentConversation.contact.id] ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
                    {presenceByUser[currentConversation.contact.id] ? "En linea" : "Desconectado"}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">
                    SignalR: {HubConnectionState[connectionState]}
                  </span>
                </div>
              </div>
            </div>
            {typingByConversation[currentConversation.id] ? (
              <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                {typingByConversation[currentConversation.id]} esta escribiendo...
              </div>
            ) : null}
          </div>
        </header>

        <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,0.72))] p-4 sm:p-6">
          {messages.map((message) => {
            const own = message.senderId === user?.id;
            const isAttachmentMessage = message.type !== "text";
            return (
              <div
                key={message.id}
                className={clsx(
                  "max-w-[88%] rounded-[24px] text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)] sm:max-w-[78%]",
                  own ? "ml-auto bg-brand-600 text-white" : "border border-white/70 bg-white text-slate-800",
                  isAttachmentMessage ? "p-2.5" : "break-words px-4 py-3.5"
                )}
              >
                {renderMessageContent(message)}
                <p className={clsx("mt-2 text-[10px] font-medium", own ? "text-brand-100" : "text-slate-500")}>
                  {new Date(message.createdAt).toLocaleTimeString()} {own ? `- ${message.status}` : ""}
                </p>
              </div>
            );
          })}
        </section>
      </>
    );
  };

  const renderGroupMain = () => {
    if (!currentGroup) {
      return (
        <div className="m-auto max-w-md text-center text-slate-500">
          <p className="eyebrow-label">Conversaciones grupales</p>
          <p className="mt-3 text-2xl font-bold text-slate-900">Selecciona un grupo</p>
          <p className="mt-2 text-sm leading-6">Crea uno nuevo desde el panel lateral y agrega miembros de tus contactos.</p>
        </div>
      );
    }

    return (
      <>
        <header className="border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow-label">Grupo activo</p>
              <h2 className="mt-2 text-xl font-bold text-slate-950">{currentGroup.name}</h2>
              <p className="mt-2 text-xs text-slate-500">{groupMembers.length} miembros</p>
            </div>
            <div className="flex max-w-full flex-wrap gap-2">
              {groupMembers.slice(0, 4).map((member) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600" key={member.id}>
                  {member.publicAlias}
                </span>
              ))}
            </div>
          </div>
        </header>

        <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,0.72))] p-4 sm:p-6">
          {groupMessages.map((message) => {
            const own = message.senderId === user?.id;
            const isAttachmentMessage = message.type !== "text";
            return (
              <div
                key={message.id}
                className={clsx(
                  "max-w-[90%] rounded-[24px] text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)] sm:max-w-[82%]",
                  own ? "ml-auto bg-brand-600 text-white" : "border border-white/70 bg-white text-slate-800",
                  isAttachmentMessage ? "p-2.5" : "break-words px-4 py-3.5"
                )}
              >
                {!own ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">{message.senderAlias}</p> : null}
                {renderMessageContent(message)}
                <p className={clsx("mt-2 text-[10px] font-medium", own ? "text-brand-100" : "text-slate-500")}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </div>
            );
          })}
        </section>
      </>
    );
  };

  const renderSidebarContent = () => {
    if (panel === "chats") {
      return (
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={clsx(
                "w-full rounded-[22px] border px-4 py-3 text-left transition",
                selectedConversationId === conversation.id ? "border-brand-300 bg-brand-50 shadow-[0_18px_26px_-24px_rgba(79,101,115,0.95)]" : "border-white/70 bg-white/85 hover:border-brand-200 hover:bg-white"
              )}
              onClick={() => setSelectedConversationId(conversation.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-medium text-slate-900">{conversation.contact.alias || conversation.contact.publicAlias}</p>
                <span className={clsx("h-2.5 w-2.5 rounded-full", presenceByUser[conversation.contact.id] ? "bg-emerald-500" : "bg-slate-300")} />
              </div>
              {conversation.lastMessage ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {getMessagePreview(conversation.lastMessage)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Sin mensajes</p>
              )}
            </button>
          ))}
        </div>
      );
    }

    if (panel === "groups") {
      return (
        <div className="space-y-4">
          <form className="rounded-[24px] border border-white/70 bg-white/82 p-4" onSubmit={(event) => {
            createGroup(event).catch(() => {
              setStatusText("No fue posible crear el grupo.");
            });
          }}>
            <p className="text-xs font-semibold uppercase text-slate-500">Nuevo grupo</p>
            <input
              className="field-input mt-3"
              placeholder="Nombre del grupo"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
            />
            <div className="mt-3 max-h-40 space-y-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50/85 p-3">
              {contacts.length === 0 ? <p className="text-xs text-slate-500">Agrega contactos primero.</p> : null}
              {contacts.map((contact) => (
                <label key={contact.id} className="flex items-center gap-2 rounded-xl px-2 py-1 text-xs text-slate-700 transition hover:bg-white">
                  <input
                    type="checkbox"
                    checked={selectedGroupMemberIds.includes(contact.contactUser.id)}
                    onChange={() => toggleGroupMember(contact.contactUser.id)}
                  />
                  <span>{contact.alias || contact.contactUser.publicAlias}</span>
                </label>
              ))}
            </div>
            <button className="primary-button mt-3 w-full" type="submit">
              Crear grupo
            </button>
          </form>

          <div className="space-y-3">
            {groupChats.map((group) => (
              <button
                key={group.id}
                className={clsx(
                  "w-full rounded-[22px] border px-4 py-3 text-left transition",
                  selectedGroupId === group.id ? "border-brand-300 bg-brand-50 shadow-[0_18px_26px_-24px_rgba(79,101,115,0.95)]" : "border-white/70 bg-white/85 hover:border-brand-200 hover:bg-white"
                )}
                onClick={() => setSelectedGroupId(group.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-medium text-slate-900">{group.name}</p>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] text-brand-700">{group.memberCount}</span>
                </div>
                {group.lastMessage ? (
                  <p className="mt-1 truncate text-xs text-slate-500">{getMessagePreview(group.lastMessage)}</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">Sin mensajes</p>
                )}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (panel === "contacts") {
      return (
        <div className="space-y-4">
          <article className="rounded-[24px] border border-white/70 bg-white/82 p-4">
            <p className="eyebrow-label">Resumen</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Tus contactos</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">Total</p>
                <p className="mt-1 text-xl font-bold text-slate-900">{contacts.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-400">En linea</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[24px] border border-white/70 bg-brand-50/80 p-4 text-sm leading-6 text-slate-600">
            Usa alias locales para encontrar conversaciones mas rapido y mantener tu agenda organizada.
          </article>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <article className="rounded-[24px] border border-white/70 bg-white/82 p-4">
          <p className="eyebrow-label">Vista rapida</p>
          <h3 className="mt-2 text-lg font-bold text-slate-900">{profile.publicAlias || user?.publicAlias}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">{profile.bio || "Completa tu bio para dar contexto a otras personas."}</p>
        </article>

        <article className="rounded-[24px] border border-white/70 bg-slate-50 p-4 text-sm">
          <p className="text-xs uppercase text-slate-400">Color de acento</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-5 w-5 rounded-full border border-slate-200" style={{ backgroundColor: profile.accentColor }} />
            <span className="font-medium text-slate-700">{profile.accentColor}</span>
          </div>
        </article>
      </div>
    );
  };

  const renderContactsWorkspace = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
        <p className="eyebrow-label">Agenda</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">Tus contactos</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Agrega personas por codigo y define alias locales para encontrarlas mas rapido.</p>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <form className="surface-panel p-4 sm:p-5" onSubmit={(event) => {
            addContactByCode(event).catch(() => {
              setStatusText("No fue posible agregar el contacto.");
            });
          }}>
            <p className="eyebrow-label">Agregar contacto</p>
            <h3 className="mt-2 text-lg font-bold text-slate-900">Invita por codigo publico</h3>
            <p className="mt-2 text-sm text-slate-500">Comparte el codigo de la otra persona o pega uno aqui para agregarla a tu red.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input className="field-input" placeholder="Codigo publico" value={addingCode} onChange={(event) => setAddingCode(event.target.value.toUpperCase())} />
              <button className="primary-button sm:min-w-36" type="submit">Agregar</button>
            </div>
          </form>

          <div className="surface-panel p-4 sm:p-5">
            <p className="eyebrow-label">Estadisticas</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Total</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{contacts.length}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">En linea</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Grupos</p>
                <p className="mt-2 text-2xl font-bold text-slate-900">{groupChats.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {contacts.map((contact) => (
            <article className="surface-panel p-4 sm:p-5" key={contact.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{contact.alias || contact.contactUser.publicAlias}</h3>
                  <p className="mt-1 text-xs text-slate-500">Codigo: {contact.contactUser.publicCode}</p>
                </div>
                <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", presenceByUser[contact.contactUser.id] ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                  {presenceByUser[contact.contactUser.id] ? "En linea" : "Sin conexion"}
                </span>
              </div>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Alias local</label>
              <input
                className="field-input mt-2"
                placeholder="Alias local"
                defaultValue={contact.alias ?? ""}
                onBlur={(event) => {
                  updateAlias(contact.id, event.target.value).catch(() => {
                    setStatusText("No fue posible actualizar alias.");
                  });
                }}
              />
            </article>
          ))}

          {contacts.length === 0 ? (
            <div className="surface-panel p-6 text-center text-slate-500 md:col-span-2 2xl:col-span-3">
              <p className="text-lg font-semibold text-slate-900">Aun no tienes contactos</p>
              <p className="mt-2 text-sm">Agrega tu primer contacto con su codigo publico para empezar a chatear.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );

  const renderProfileWorkspace = () => (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
        <p className="eyebrow-label">Configuracion personal</p>
        <h2 className="mt-2 text-xl font-bold text-slate-950">Tu perfil</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Actualiza la informacion visible para ti y para las personas que conversan contigo.</p>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
          <form className="surface-panel p-4 sm:p-5" onSubmit={(event) => {
            saveProfile(event).catch(() => {
              setStatusText("No fue posible actualizar el perfil.");
            });
          }}>
            <p className="eyebrow-label">Datos visibles</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <input className="field-input" placeholder="Apodo publico" value={profile.publicAlias} onChange={(event) => setProfile((prev) => ({ ...prev, publicAlias: event.target.value }))} />
              <select className="field-input" value={profile.theme} onChange={(event) => setProfile((prev) => ({ ...prev, theme: Number(event.target.value) }))}>
                <option value={1}>Tema claro</option>
                <option value={2}>Tema oscuro</option>
              </select>
            </div>
            <textarea className="field-textarea mt-4 min-h-36" placeholder="Bio" value={profile.bio} onChange={(event) => setProfile((prev) => ({ ...prev, bio: event.target.value }))} />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="rounded-[24px] border border-dashed border-brand-300 bg-brand-50/75 p-4 text-sm text-slate-600" htmlFor="profile-image">
                <span className="block font-semibold text-slate-900">Foto de perfil</span>
                <span className="mt-1 block text-xs">Selecciona jpg, png o webp para actualizar tu avatar.</span>
                <input id="profile-image" type="file" accept="image/png,image/jpeg,image/webp" className="mt-3 block w-full text-xs" onChange={(event) => {
                  uploadProfileImage(event).catch(() => {
                    setStatusText("No fue posible subir la foto.");
                  });
                }} />
              </label>
              <div className="justify-self-start rounded-[24px] border border-slate-200 bg-white p-4">
                <p className="text-xs uppercase text-slate-400">Color acento</p>
                <input className="mt-3 h-12 w-24 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" type="color" value={profile.accentColor} onChange={(event) => setProfile((prev) => ({ ...prev, accentColor: event.target.value }))} />
              </div>
            </div>
            <button className="primary-button mt-4 w-full sm:w-auto" type="submit">Guardar perfil</button>
          </form>

          <aside className="surface-panel p-4 sm:p-5">
            <p className="eyebrow-label">Vista rapida</p>
            <div className="mt-4 rounded-[28px] bg-[linear-gradient(145deg,#27343d,#4f6573)] p-5 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Perfil publico</p>
              <h3 className="mt-3 text-2xl font-bold">{profile.publicAlias || user?.publicAlias || "Sin alias"}</h3>
              <p className="mt-2 text-sm leading-6 text-white/80">{profile.bio || "Tu bio aparecera aqui cuando la completes."}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="h-4 w-4 rounded-full border border-white/60" style={{ backgroundColor: profile.accentColor }} />
                <span className="text-sm text-white/80">{profile.accentColor}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[24px] bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">Consejo</p>
              <p className="mt-2 leading-6">Un alias claro y una bio corta ayudan a identificarte mejor en chats privados y grupales.</p>
            </div>
            <div className="mt-4 rounded-[24px] border border-brand-200 bg-brand-50/75 p-4 text-sm text-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">Notificaciones push web</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Recibe avisos cuando lleguen mensajes y no tengas la aplicacion abierta en primer plano.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                  {pushEnabled ? "Activas" : "Inactivas"}
                </span>
              </div>

              {!pushSupported ? (
                <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                  Este navegador no soporta Service Worker o Push API en el contexto actual.
                </p>
              ) : !pushConfigured ? (
                <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                  El servidor aun no tiene configuradas las claves VAPID para enviar push.
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  <div className="rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                    Permiso del navegador: {pushPermission === "granted" ? "concedido" : pushPermission === "denied" ? "bloqueado" : "pendiente"}
                  </div>
                  <button
                    className="primary-button w-full"
                    type="button"
                    disabled={pushBusy}
                    onClick={() => {
                      (pushEnabled ? deactivatePush() : activatePush()).catch(() => undefined);
                    }}
                  >
                    {pushBusy ? "Actualizando notificaciones..." : pushEnabled ? "Desactivar notificaciones push" : "Activar notificaciones push"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-[24px] border border-brand-200 bg-brand-50/75 p-4 text-sm text-slate-700">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">Claves seguras</p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Registra una passkey para entrar con huella, rostro o PIN sin afectar tu login actual.
                  </p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700">
                  {user?.passkeyCount ?? passkeys.length} activas
                </span>
              </div>

              {passkeyAvailable ? (
                <div className="mt-4 space-y-3">
                  <input
                    className="field-input"
                    placeholder="Nombre del dispositivo (opcional)"
                    value={newPasskeyName}
                    onChange={(event) => setNewPasskeyName(event.target.value)}
                  />
                  <button className="primary-button w-full" type="button" disabled={passkeyBusy} onClick={() => {
                    createPasskey().catch(() => undefined);
                  }}>
                    {passkeyBusy ? "Registrando clave segura..." : "Registrar clave segura"}
                  </button>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                  Tu navegador actual no expone WebAuthn en un contexto seguro compatible.
                </p>
              )}

              <div className="mt-4 space-y-3">
                {passkeys.length === 0 ? (
                  <div className="rounded-2xl bg-white px-4 py-3 text-xs text-slate-500">
                    Aun no has registrado ninguna clave segura en esta cuenta.
                  </div>
                ) : (
                  passkeys.map((passkey) => (
                    <article className="rounded-2xl bg-white px-4 py-3" key={passkey.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{passkey.friendlyName}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {passkey.authenticatorAttachment === "platform" ? "Integrada en el dispositivo" : "Llave o dispositivo externo"}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                          {passkey.transports[0] || "passkey"}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-slate-500">Creada: {formatRelativeDate(passkey.createdAt)}</p>
                      <p className="mt-1 text-xs text-slate-500">Ultimo uso: {formatRelativeDate(passkey.lastUsedAt)}</p>
                      <button
                        className="mt-3 text-xs font-semibold text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:text-slate-400"
                        type="button"
                        disabled={passkeyRemovingId === passkey.id}
                        onClick={() => {
                          deletePasskey(passkey.id).catch(() => undefined);
                        }}
                      >
                        {passkeyRemovingId === passkey.id ? "Eliminando..." : "Eliminar clave segura"}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4">
        <header className="surface-panel overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow-label">Centro de conversaciones</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Habla Mas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Gestiona chats privados, grupos, contactos y tu perfil desde un espacio mas amplio y comodo.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Privados</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{conversations.length}</p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Grupos</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{groupChats.length}</p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">En linea</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="surface-panel flex min-h-[260px] flex-col overflow-hidden">
            <div className="border-b border-white/70 px-4 py-4 sm:px-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="eyebrow-label">Cuenta activa</p>
                  <h2 className="mt-2 text-xl font-bold text-slate-950">{user?.publicAlias}</h2>
                  <p className="mt-1 text-sm text-slate-500">{user?.publicCode}</p>
                </div>
                <button className="secondary-button px-3 py-2 text-xs sm:text-sm" onClick={() => logout().catch(() => undefined)}>
                  Salir
                </button>
              </div>

              <nav className="mt-4 flex gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-2">
                {(Object.keys(panelLabels) as Panel[]).map((item) => (
                  <button
                    className={clsx(
                      "whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-semibold transition",
                      panel === item ? "bg-brand-600 text-white shadow-[0_16px_30px_-18px_rgba(79,101,115,0.95)]" : "border border-slate-200 bg-white/70 text-slate-700 hover:border-brand-300 hover:text-brand-700"
                    )}
                    key={item}
                    onClick={() => setPanel(item)}
                  >
                    {panelLabels[item]}
                  </button>
                ))}
              </nav>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <Link className="secondary-button" to="/chatbot">
                  Chatbot IA
                </Link>
                <div className="rounded-2xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600">
                  Panel actual: {panelLabels[panel]}
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {renderSidebarContent()}
            </div>
          </aside>

          <main className="surface-panel flex min-h-[70vh] flex-col overflow-hidden">
            {panel === "groups" ? renderGroupMain() : panel === "chats" ? renderChatMain() : panel === "contacts" ? renderContactsWorkspace() : renderProfileWorkspace()}

            {(panel === "chats" || panel === "groups") ? (
              <footer className="border-t border-white/70 bg-white/82 p-4 sm:p-5">
                <form className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center" onSubmit={(event) => {
                  sendText(event).catch(() => {
                    setStatusText("No fue posible enviar el mensaje.");
                  });
                }}>
                  <input
                    className="field-input flex-1 text-base lg:min-w-[220px]"
                    placeholder={panel === "groups" ? "Escribe al grupo" : "Escribe un mensaje"}
                    value={messageInput}
                    onChange={(event) => {
                      setMessageInput(event.target.value);
                      if (panel === "chats") {
                        sendTyping(event.target.value.trim().length > 0).catch(() => undefined);
                      }
                    }}
                  />
                  <label className="secondary-button cursor-pointer">
                    Adjuntar
                    <input className="hidden" accept={ATTACHMENT_ACCEPT} type="file" onChange={(event) => {
                      sendAttachment(event).catch(() => {
                        setStatusText("No fue posible enviar el adjunto.");
                      });
                    }} />
                  </label>
                  <button
                    className={clsx(
                      "secondary-button",
                      isRecordingVoice ? "border-rose-300 bg-rose-50 text-rose-700" : undefined
                    )}
                    type="button"
                    onClick={() => {
                      toggleVoiceRecording().catch(() => {
                        setStatusText("No fue posible usar el microfono.");
                        setIsRecordingVoice(false);
                      });
                    }}
                  >
                    {isRecordingVoice ? "Detener voz" : "Grabar voz"}
                  </button>
                  <button className="primary-button lg:min-w-36" type="submit">Enviar</button>
                </form>
              </footer>
            ) : null}
          </main>
        </div>
      </div>

      {statusText ? <div className="mx-auto mt-4 max-w-[1760px] rounded-2xl bg-brand-900 px-4 py-3 text-sm font-medium text-white shadow-[0_18px_34px_-24px_rgba(15,23,42,0.7)]">{statusText}</div> : null}
    </div>
  );
}
