import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, ReactNode, RefObject } from "react";
import clsx from "clsx";
import { HubConnection, HubConnectionState } from "@microsoft/signalr";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";
import { createChatConnection } from "../../lib/signalr";
import type {
  ChatAttachmentDto,
  ChatMessageType,
  ContactDto,
  ConversationSummary,
  GroupChatSummary,
  GroupMemberDto,
  GroupMessageDto,
  MessageDto
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
type ThemeMode = "light" | "dark";

interface IconProps {
  className?: string;
}

interface AvatarProps {
  name: string;
  src?: string;
  online?: boolean;
  size?: "md" | "lg";
}

interface ThemeToggleProps {
  mode: ThemeMode;
  onToggle: () => void;
}

interface SidebarNavButtonProps {
  active: boolean;
  badge?: ReactNode;
  description: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface ChatHeaderProps {
  aside?: ReactNode;
  avatar: ReactNode;
  eyebrow: string;
  statusRow?: ReactNode;
  subtitle: ReactNode;
  title: string;
}

interface MessageViewportProps {
  children: ReactNode;
  emptyState: ReactNode;
  viewportRef: RefObject<HTMLDivElement | null>;
}

interface MessageBubbleProps {
  message: ChatRenderableMessage;
  meta: string;
  own: boolean;
  renderContent: (message: ChatRenderableMessage) => ReactNode;
  senderLabel?: string;
}

interface MessageComposerProps {
  attachmentAccept: string;
  canSend: boolean;
  disabled: boolean;
  inputValue: string;
  isRecordingVoice: boolean;
  onAttachment: (event: ChangeEvent<HTMLInputElement>) => void;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggleVoice: () => void;
  placeholder: string;
}

const THEME_STORAGE_KEY = "hablamas_app_theme";
const ATTACHMENT_ACCEPT = "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime,audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.rar,.rtf";

function ChatIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M8 10h8M8 14h5m-7 6 2.8-3.2A3 3 0 0 1 11 16h7a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3H6A3 3 0 0 0 3 6v7a3 3 0 0 0 3 3v4Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function GroupIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Zm8 2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ContactIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M20 21a8 8 0 1 0-16 0m12-11a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ProfileIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm7 9a7 7 0 0 0-14 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function BotIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M9 3h6m-3 0v4m-7 4h14m-1 10H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2ZM9 15h.01M15 15h.01" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SunIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 3v2.25M12 18.75V21M4.97 4.97l1.6 1.6m10.86 10.86 1.6 1.6M3 12h2.25m13.5 0H21M4.97 19.03l1.6-1.6m10.86-10.86 1.6-1.6M15.75 12A3.75 3.75 0 1 1 12 8.25 3.75 3.75 0 0 1 15.75 12Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function MoonIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

const panelLabels: Record<Panel, string> = {
  chats: "Chats",
  groups: "Grupos",
  contacts: "Contactos",
  profile: "Perfil"
};

const panelDescriptions: Record<Panel, string> = {
  chats: "Mensajes privados en tiempo real.",
  groups: "Salas activas y nuevos grupos.",
  contacts: "Agenda, alias y presencia.",
  profile: "Tema, bio y foto de perfil."
};

function getStoredTheme(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "light" ? stored : null;
}

function toThemeNumber(mode: ThemeMode): number {
  return mode === "dark" ? 2 : 1;
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
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

function formatMessageTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatSidebarTime(value?: string): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (sameDay) {
    return formatMessageTime(value);
  }

  return date.toLocaleDateString([], {
    day: "numeric",
    month: "short"
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

function Avatar({ name, src, online, size = "md" }: AvatarProps) {
  const sizeClasses = size === "lg" ? "h-14 w-14 text-sm" : "h-11 w-11 text-xs";
  const dotClasses = size === "lg" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <div className="relative shrink-0">
      {src ? (
        <img
          alt={name}
          className={clsx(sizeClasses, "rounded-full object-cover ring-2 ring-white/40")}
          src={src}
        />
      ) : (
        <div className={clsx(sizeClasses, "flex items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700 ring-2 ring-white/40")}>
          {getInitials(name)}
        </div>
      )}
      {typeof online === "boolean" ? (
        <span
          className={clsx(
            dotClasses,
            "absolute bottom-0 right-0 rounded-full border-2 border-[var(--surface-bg-strong)]",
            online ? "bg-emerald-500" : "bg-slate-400"
          )}
        />
      ) : null}
    </div>
  );
}

function ThemeToggle({ mode, onToggle }: ThemeToggleProps) {
  const dark = mode === "dark";

  return (
    <button
      aria-label={dark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/20"
      onClick={onToggle}
      type="button"
    >
      {dark ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
      <span>{dark ? "Claro" : "Oscuro"}</span>
    </button>
  );
}

function SidebarNavButton({ active, badge, description, icon, label, onClick }: SidebarNavButtonProps) {
  return (
    <button
      className={clsx(
        "group flex w-full items-center gap-3 rounded-[24px] border px-4 py-3 text-left transition",
        active
          ? "border-transparent bg-[linear-gradient(135deg,#4f6573,#27343d)] text-white shadow-[0_22px_44px_-28px_rgba(15,23,42,0.7)]"
          : "border-[var(--surface-border-strong)] bg-[var(--surface-bg-strong)] text-[var(--app-text)] hover:border-brand-300 hover:bg-[var(--muted-card-bg)]"
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={clsx(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition",
          active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700 group-hover:bg-brand-100"
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{label}</span>
        <span className={clsx("mt-0.5 block truncate text-xs", active ? "text-white/72" : "text-[var(--app-subtle-text)]")}>{description}</span>
      </span>
      {badge ? (
        <span className={clsx("rounded-full px-2.5 py-1 text-[11px] font-semibold", active ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700")}>
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ChatHeader({ aside, avatar, eyebrow, statusRow, subtitle, title }: ChatHeaderProps) {
  return (
    <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-5 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {avatar}
          <div className="min-w-0">
            <p className="eyebrow-label">{eyebrow}</p>
            <h2 className="mt-2 truncate text-xl font-bold text-[var(--app-text)]">{title}</h2>
            <div className="mt-2 text-sm text-[var(--app-subtle-text)]">{subtitle}</div>
            {statusRow ? <div className="mt-3 flex flex-wrap items-center gap-2">{statusRow}</div> : null}
          </div>
        </div>
        {aside ? <div className="flex max-w-full flex-wrap items-center gap-2">{aside}</div> : null}
      </div>
    </header>
  );
}

function MessageViewport({ children, emptyState, viewportRef }: MessageViewportProps) {
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section
      className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] px-4 py-5 sm:px-6"
      ref={viewportRef}
    >
      <div className="flex min-h-full flex-col justify-end gap-3">
        {hasContent ? children : emptyState}
      </div>
    </section>
  );
}

function MessageBubble({ message, meta, own, renderContent, senderLabel }: MessageBubbleProps) {
  const attachment = message.type !== "text";

  return (
    <article className={clsx("flex w-full", own ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "w-fit max-w-[min(92%,46rem)] rounded-[28px] border shadow-[0_24px_48px_-32px_rgba(15,23,42,0.45)]",
          own
            ? "rounded-br-lg border-transparent bg-[linear-gradient(135deg,var(--bubble-own-from),var(--bubble-own-to))] text-[var(--bubble-own-text)]"
            : "rounded-bl-lg border-[var(--bubble-peer-border)] bg-[var(--bubble-peer-bg)] text-[var(--bubble-peer-text)]",
          attachment ? "px-3 py-3" : "px-4 py-3.5"
        )}
      >
        {senderLabel ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">{senderLabel}</p> : null}
        {renderContent(message)}
        <p className={clsx("mt-2 text-[10px] font-medium", own ? "text-[var(--bubble-own-muted)]" : "text-[var(--bubble-peer-muted)]")}>{meta}</p>
      </div>
    </article>
  );
}

function MessageComposer({
  attachmentAccept,
  canSend,
  disabled,
  inputValue,
  isRecordingVoice,
  onAttachment,
  onChange,
  onSubmit,
  onToggleVoice,
  placeholder
}: MessageComposerProps) {
  return (
    <footer className="shrink-0 border-t border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-4 py-4 backdrop-blur-xl sm:px-6">
      <form className="flex flex-col gap-3 xl:flex-row xl:items-center" onSubmit={onSubmit}>
        <div className="flex min-w-0 flex-1 items-center rounded-[28px] border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
          <input
            className="w-full bg-transparent px-3 py-2 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--input-placeholder)] disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            value={inputValue}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className={clsx("secondary-button cursor-pointer", disabled ? "pointer-events-none opacity-60" : undefined)}>
            Adjuntar
            <input accept={attachmentAccept} className="hidden" onChange={onAttachment} type="file" />
          </label>

          <button
            className={clsx(
              "secondary-button",
              isRecordingVoice ? "border-rose-400 bg-rose-50 text-rose-700" : undefined
            )}
            disabled={disabled}
            onClick={onToggleVoice}
            type="button"
          >
            {isRecordingVoice ? "Detener voz" : "Grabar voz"}
          </button>

          <button className="primary-button min-w-[132px]" disabled={!canSend || disabled} type="submit">
            Enviar
          </button>
        </div>
      </form>
    </footer>
  );
}

function EmptyMessagingState({ eyebrow, title, description }: { description: string; eyebrow: string; title: string }) {
  return (
    <div className="m-auto max-w-md rounded-[32px] border border-dashed border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-8 text-center">
      <p className="eyebrow-label">{eyebrow}</p>
      <p className="mt-3 text-2xl font-bold text-[var(--app-text)]">{title}</p>
      <p className="mt-3 text-sm leading-6 text-[var(--app-subtle-text)]">{description}</p>
    </div>
  );
}

export function AppPage() {
  const { user, logout, refreshProfile } = useAuth();
  const [panel, setPanel] = useState<Panel>("chats");
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme() ?? "light");
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
    theme: toThemeNumber(themeMode),
    accentColor: "#5f7888"
  });
  const [statusText, setStatusText] = useState<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const contactsRef = useRef<ContactDto[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const messageViewportRef = useRef<HTMLDivElement | null>(null);

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

  const messagingPanel = panel === "chats" || panel === "groups";
  const composerEnabled = panel === "groups" ? Boolean(currentGroup) : Boolean(currentConversation);
  const canSendMessage = messageInput.trim().length > 0;

  const applyThemeMode = (mode: ThemeMode): void => {
    setThemeMode(mode);
    setProfile((prev) => ({ ...prev, theme: toThemeNumber(mode) }));
  };

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = themeMode;
    }

    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    }
  }, [themeMode]);

  useEffect(() => {
    if (!statusText) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStatusText(null);
    }, 4200);

    return () => window.clearTimeout(timer);
  }, [statusText]);

  useEffect(() => () => {
    mediaRecorderRef.current?.stop();
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  useEffect(() => {
    if (!messagingPanel) {
      return;
    }

    const viewport = messageViewportRef.current;
    if (!viewport) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
  }, [messagingPanel, selectedConversationId, selectedGroupId, messages.length, groupMessages.length]);

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
    const nextTheme = getStoredTheme() ?? (Number(response.data.theme) === 2 ? "dark" : "light");

    setProfile({
      bio: response.data.bio ?? "",
      publicAlias: response.data.publicAlias ?? "",
      theme: toThemeNumber(nextTheme),
      accentColor: response.data.accentColor ?? "#5f7888"
    });
    setThemeMode(nextTheme);
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

    Promise.all([loadSidebar(), loadGroups(), loadProfile()]).catch(() => {
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
          return prev.map((message) => (message.id === payload.messageId ? { ...message, status: payload.status } : message));
        }

        return prev.map((message) => (message.senderId === user.id ? { ...message, status: payload.status } : message));
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

  const sendText = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const sendAttachment = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
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

    recorder.ondataavailable = (recordedEvent) => {
      if (recordedEvent.data.size > 0) {
        voiceChunksRef.current.push(recordedEvent.data);
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

  const addContactByCode = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const createGroup = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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

  const saveProfile = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    await authApi.put("/profile/me", profile);
    await refreshProfile();
    setStatusText("Perfil actualizado.");
  };

  const uploadProfileImage = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
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
        <a className="block" href={attachmentUrl} rel="noreferrer" target="_blank">
          <img alt={message.attachmentName || "Imagen"} className="h-auto max-h-72 w-auto max-w-[min(100%,22rem)] rounded-2xl object-cover" src={attachmentUrl} />
        </a>
      );
    }

    if (message.type === "video" && attachmentUrl) {
      return (
        <video
          className="h-auto max-h-80 w-auto max-w-[min(100%,24rem)] rounded-2xl bg-black"
          controls
          preload="metadata"
          src={attachmentUrl}
        />
      );
    }

    if (message.type === "audio" && attachmentUrl) {
      return (
        <div className="min-w-[220px] max-w-[min(100%,24rem)] space-y-2">
          <p className="text-xs font-medium">{message.attachmentName || "Nota de voz"}</p>
          <audio className="w-full" controls preload="metadata" src={attachmentUrl} />
          {message.attachmentSizeBytes ? <p className="text-[11px] opacity-80">{formatBytes(message.attachmentSizeBytes)}</p> : null}
        </div>
      );
    }

    if (message.type === "file" && attachmentUrl) {
      return (
        <a
          className="block min-w-[220px] max-w-[min(100%,24rem)] rounded-2xl border border-current/15 bg-black/5 px-4 py-3"
          href={attachmentUrl}
          rel="noreferrer"
          target="_blank"
        >
          <p className="text-xs uppercase tracking-wide opacity-70">Archivo</p>
          <p className="mt-1 break-words font-medium [overflow-wrap:anywhere]">{message.attachmentName || "Descargar archivo"}</p>
          <p className="mt-1 text-[11px] opacity-80">
            {[message.attachmentContentType, formatBytes(message.attachmentSizeBytes)].filter(Boolean).join(" | ")}
          </p>
        </a>
      );
    }

    return <p className="max-w-[60ch] whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere]">{message.text ?? ""}</p>;
  };

  const renderChatMain = () => {
    if (!currentConversation) {
      return (
        <div className="flex min-h-0 flex-1">
          <EmptyMessagingState
            description="Agrega contactos para comenzar o cambia al panel de contactos para organizar tus alias."
            eyebrow="Mensajeria privada"
            title="Selecciona una conversacion"
          />
        </div>
      );
    }

    const contactName = currentConversation.contact.alias || currentConversation.contact.publicAlias;
    const online = presenceByUser[currentConversation.contact.id];

    return (
      <>
        <ChatHeader
          aside={typingByConversation[currentConversation.id] ? (
            <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
              {typingByConversation[currentConversation.id]} esta escribiendo...
            </div>
          ) : undefined}
          avatar={<Avatar name={contactName} online={online} size="lg" src={currentConversation.contact.profileImageUrl} />}
          eyebrow="Chat privado"
          statusRow={(
            <>
              <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", online ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600")}>
                {online ? "En linea" : "Desconectado"}
              </span>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">
                SignalR: {HubConnectionState[connectionState]}
              </span>
            </>
          )}
          subtitle={<p className="truncate">Codigo: {currentConversation.contact.publicCode}</p>}
          title={contactName}
        />

        <MessageViewport
          emptyState={(
            <EmptyMessagingState
              description="Todavia no hay mensajes en esta conversacion."
              eyebrow="Mensajes"
              title="Empieza el chat"
            />
          )}
          viewportRef={messageViewportRef}
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              meta={`${formatMessageTime(message.createdAt)}${message.senderId === user?.id ? ` · ${message.status}` : ""}`}
              own={message.senderId === user?.id}
              renderContent={renderMessageContent}
            />
          ))}
        </MessageViewport>
      </>
    );
  };

  const renderGroupMain = () => {
    if (!currentGroup) {
      return (
        <div className="flex min-h-0 flex-1">
          <EmptyMessagingState
            description="Crea uno nuevo desde el panel lateral y agrega miembros de tus contactos."
            eyebrow="Conversaciones grupales"
            title="Selecciona un grupo"
          />
        </div>
      );
    }

    return (
      <>
        <ChatHeader
          aside={groupMembers.slice(0, 4).map((member) => (
            <span className="rounded-full border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] px-3 py-1 text-xs font-semibold text-[var(--app-subtle-text)]" key={member.id}>
              {member.publicAlias}
            </span>
          ))}
          avatar={<Avatar name={currentGroup.name} size="lg" />}
          eyebrow="Grupo activo"
          statusRow={<span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{groupMembers.length} miembros</span>}
          subtitle={<p className="truncate">Conversacion grupal compartida</p>}
          title={currentGroup.name}
        />

        <MessageViewport
          emptyState={(
            <EmptyMessagingState
              description="Aun no hay mensajes en este grupo."
              eyebrow="Mensajes"
              title="Todo listo para empezar"
            />
          )}
          viewportRef={messageViewportRef}
        >
          {groupMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              meta={formatMessageTime(message.createdAt)}
              own={message.senderId === user?.id}
              renderContent={renderMessageContent}
              senderLabel={message.senderId === user?.id ? undefined : message.senderAlias}
            />
          ))}
        </MessageViewport>
      </>
    );
  };

  const renderSidebarContent = () => {
    if (panel === "chats") {
      return (
        <div className="space-y-3">
          <div className="rounded-[28px] border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4">
            <p className="eyebrow-label">Resumen</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[var(--muted-card-border)] bg-[var(--surface-bg-strong)] p-3">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">Privados</p>
                <p className="mt-1 text-2xl font-bold text-[var(--app-text)]">{conversations.length}</p>
              </div>
              <div className="rounded-2xl border border-[var(--muted-card-border)] bg-[var(--surface-bg-strong)] p-3">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">En linea</p>
                <p className="mt-1 text-2xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
            </div>
          </div>

          {conversations.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-5 text-sm text-[var(--app-subtle-text)]">
              No tienes conversaciones privadas todavia.
            </div>
          ) : null}

          {conversations.map((conversation) => {
            const selected = selectedConversationId === conversation.id;
            const contactName = conversation.contact.alias || conversation.contact.publicAlias;
            const previewDate = conversation.lastMessageAt ?? conversation.createdAt;

            return (
              <button
                className={clsx(
                  "w-full rounded-[26px] border p-3 text-left transition",
                  selected
                    ? "border-transparent bg-[linear-gradient(135deg,#4f6573,#27343d)] text-white shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
                    : "border-[var(--surface-border-strong)] bg-[var(--surface-bg-strong)] hover:border-brand-300 hover:bg-[var(--muted-card-bg)]"
                )}
                key={conversation.id}
                onClick={() => setSelectedConversationId(conversation.id)}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <Avatar
                    name={contactName}
                    online={presenceByUser[conversation.contact.id]}
                    src={conversation.contact.profileImageUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={clsx("truncate text-sm font-semibold", selected ? "text-white" : "text-[var(--app-text)]")}>{contactName}</p>
                      <span className={clsx("shrink-0 text-[11px]", selected ? "text-white/72" : "text-[var(--app-subtle-text)]")}>
                        {formatSidebarTime(previewDate)}
                      </span>
                    </div>
                    <p className={clsx("mt-1 truncate text-xs", selected ? "text-white/72" : "text-[var(--app-subtle-text)]")}>
                      {getMessagePreview(conversation.lastMessage)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (panel === "groups") {
      return (
        <div className="space-y-4">
          <form className="rounded-[28px] border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-4" onSubmit={(event) => {
            createGroup(event).catch(() => {
              setStatusText("No fue posible crear el grupo.");
            });
          }}>
            <p className="eyebrow-label">Nuevo grupo</p>
            <input
              className="field-input mt-3"
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Nombre del grupo"
              value={newGroupName}
            />
            <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-2xl border border-[var(--muted-card-border)] bg-[var(--surface-bg-strong)] p-3">
              {contacts.length === 0 ? <p className="text-xs text-[var(--app-subtle-text)]">Agrega contactos primero.</p> : null}
              {contacts.map((contact) => (
                <label className="flex items-center gap-2 rounded-xl px-2 py-1 text-xs text-[var(--app-text)] transition hover:bg-black/5" key={contact.id}>
                  <input
                    checked={selectedGroupMemberIds.includes(contact.contactUser.id)}
                    onChange={() => toggleGroupMember(contact.contactUser.id)}
                    type="checkbox"
                  />
                  <span>{contact.alias || contact.contactUser.publicAlias}</span>
                </label>
              ))}
            </div>
            <button className="primary-button mt-3 w-full" type="submit">
              Crear grupo
            </button>
          </form>

          {groupChats.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-5 text-sm text-[var(--app-subtle-text)]">
              No hay grupos todavia. Crea el primero desde este panel.
            </div>
          ) : null}

          {groupChats.map((group) => {
            const selected = selectedGroupId === group.id;

            return (
              <button
                className={clsx(
                  "w-full rounded-[26px] border p-3 text-left transition",
                  selected
                    ? "border-transparent bg-[linear-gradient(135deg,#4f6573,#27343d)] text-white shadow-[0_24px_48px_-30px_rgba(15,23,42,0.7)]"
                    : "border-[var(--surface-border-strong)] bg-[var(--surface-bg-strong)] hover:border-brand-300 hover:bg-[var(--muted-card-bg)]"
                )}
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <Avatar name={group.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={clsx("truncate text-sm font-semibold", selected ? "text-white" : "text-[var(--app-text)]")}>{group.name}</p>
                      <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold", selected ? "bg-white/15 text-white" : "bg-brand-50 text-brand-700")}>
                        {group.memberCount}
                      </span>
                    </div>
                    <p className={clsx("mt-1 truncate text-xs", selected ? "text-white/72" : "text-[var(--app-subtle-text)]")}>
                      {getMessagePreview(group.lastMessage)}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      );
    }

    if (panel === "contacts") {
      return (
        <div className="space-y-4">
          <article className="rounded-[28px] border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-4">
            <p className="eyebrow-label">Resumen</p>
            <h3 className="mt-2 text-lg font-bold text-[var(--app-text)]">Tus contactos</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-2xl border border-[var(--muted-card-border)] bg-[var(--surface-bg-strong)] p-3">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">Total</p>
                <p className="mt-1 text-xl font-bold text-[var(--app-text)]">{contacts.length}</p>
              </div>
              <div className="rounded-2xl border border-[var(--muted-card-border)] bg-[var(--surface-bg-strong)] p-3">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">En linea</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
            </div>
          </article>

          <article className="rounded-[28px] border border-[var(--surface-border-strong)] bg-[linear-gradient(135deg,rgba(95,120,136,0.12),rgba(79,101,115,0.06))] p-4 text-sm leading-6 text-[var(--app-subtle-text)]">
            Usa alias locales para encontrar conversaciones mas rapido y mantener tu agenda organizada.
          </article>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <article className="rounded-[28px] border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-4">
          <p className="eyebrow-label">Vista rapida</p>
          <h3 className="mt-2 text-lg font-bold text-[var(--app-text)]">{profile.publicAlias || user?.publicAlias}</h3>
          <p className="mt-2 text-sm leading-6 text-[var(--app-subtle-text)]">{profile.bio || "Completa tu bio para dar contexto a otras personas."}</p>
        </article>

        <article className="rounded-[28px] border border-[var(--surface-border-strong)] bg-[var(--surface-bg-strong)] p-4 text-sm">
          <p className="text-xs uppercase text-[var(--app-subtle-text)]">Color de acento</p>
          <div className="mt-3 flex items-center gap-3">
            <span className="h-5 w-5 rounded-full border border-[var(--muted-card-border)]" style={{ backgroundColor: profile.accentColor }} />
            <span className="font-medium text-[var(--app-text)]">{profile.accentColor}</span>
          </div>
        </article>
      </div>
    );
  };

  const renderContactsWorkspace = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-5 py-4 backdrop-blur-xl sm:px-6">
        <p className="eyebrow-label">Agenda</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--app-text)]">Tus contactos</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-subtle-text)]">Agrega personas por codigo y define alias locales para encontrarlas mas rapido.</p>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <form className="surface-panel p-4 sm:p-5" onSubmit={(event) => {
            addContactByCode(event).catch(() => {
              setStatusText("No fue posible agregar el contacto.");
            });
          }}>
            <p className="eyebrow-label">Agregar contacto</p>
            <h3 className="mt-2 text-lg font-bold text-[var(--app-text)]">Invita por codigo publico</h3>
            <p className="mt-2 text-sm text-[var(--app-subtle-text)]">Comparte el codigo de la otra persona o pega uno aqui para agregarla a tu red.</p>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <input className="field-input" onChange={(event) => setAddingCode(event.target.value.toUpperCase())} placeholder="Codigo publico" value={addingCode} />
              <button className="primary-button sm:min-w-36" type="submit">Agregar</button>
            </div>
          </form>

          <div className="surface-panel p-4 sm:p-5">
            <p className="eyebrow-label">Estadisticas</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">Total</p>
                <p className="mt-2 text-2xl font-bold text-[var(--app-text)]">{contacts.length}</p>
              </div>
              <div className="rounded-3xl border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">En linea</p>
                <p className="mt-2 text-2xl font-bold text-emerald-600">{onlineContacts}</p>
              </div>
              <div className="rounded-3xl border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">Grupos</p>
                <p className="mt-2 text-2xl font-bold text-[var(--app-text)]">{groupChats.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {contacts.map((contact) => (
            <article className="surface-panel p-4 sm:p-5" key={contact.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-[var(--app-text)]">{contact.alias || contact.contactUser.publicAlias}</h3>
                  <p className="mt-1 text-xs text-[var(--app-subtle-text)]">Codigo: {contact.contactUser.publicCode}</p>
                </div>
                <span className={clsx("rounded-full px-2.5 py-1 text-xs font-semibold", presenceByUser[contact.contactUser.id] ? "bg-emerald-100 text-emerald-700" : "bg-[var(--muted-card-bg)] text-[var(--app-subtle-text)]")}>
                  {presenceByUser[contact.contactUser.id] ? "En linea" : "Sin conexion"}
                </span>
              </div>

              <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--app-subtle-text)]">Alias local</label>
              <input
                className="field-input mt-2"
                defaultValue={contact.alias ?? ""}
                onBlur={(event) => {
                  updateAlias(contact.id, event.target.value).catch(() => {
                    setStatusText("No fue posible actualizar alias.");
                  });
                }}
                placeholder="Alias local"
              />
            </article>
          ))}

          {contacts.length === 0 ? (
            <div className="surface-panel p-6 text-center text-[var(--app-subtle-text)] md:col-span-2 2xl:col-span-3">
              <p className="text-lg font-semibold text-[var(--app-text)]">Aun no tienes contactos</p>
              <p className="mt-2 text-sm">Agrega tu primer contacto con su codigo publico para empezar a chatear.</p>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );

  const renderProfileWorkspace = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-5 py-4 backdrop-blur-xl sm:px-6">
        <p className="eyebrow-label">Configuracion personal</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--app-text)]">Tu perfil</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--app-subtle-text)]">Actualiza la informacion visible para ti y para las personas que conversan contigo.</p>
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
              <input
                className="field-input"
                onChange={(event) => setProfile((prev) => ({ ...prev, publicAlias: event.target.value }))}
                placeholder="Apodo publico"
                value={profile.publicAlias}
              />
              <select
                className="field-input"
                onChange={(event) => applyThemeMode(Number(event.target.value) === 2 ? "dark" : "light")}
                value={profile.theme}
              >
                <option value={1}>Tema claro</option>
                <option value={2}>Tema oscuro</option>
              </select>
            </div>
            <textarea
              className="field-textarea mt-4 min-h-36"
              onChange={(event) => setProfile((prev) => ({ ...prev, bio: event.target.value }))}
              placeholder="Bio"
              value={profile.bio}
            />
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <label className="rounded-[28px] border border-dashed border-brand-300 bg-brand-50/60 p-4 text-sm text-[var(--app-subtle-text)]" htmlFor="profile-image">
                <span className="block font-semibold text-[var(--app-text)]">Foto de perfil</span>
                <span className="mt-1 block text-xs">Selecciona jpg, png o webp para actualizar tu avatar.</span>
                <input
                  className="mt-3 block w-full text-xs"
                  id="profile-image"
                  onChange={(event) => {
                    uploadProfileImage(event).catch(() => {
                      setStatusText("No fue posible subir la foto.");
                    });
                  }}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                />
              </label>
              <div className="justify-self-start rounded-[28px] border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4">
                <p className="text-xs uppercase text-[var(--app-subtle-text)]">Color acento</p>
                <input
                  className="mt-3 h-12 w-24 cursor-pointer rounded-xl border border-[var(--muted-card-border)] bg-transparent p-1"
                  onChange={(event) => setProfile((prev) => ({ ...prev, accentColor: event.target.value }))}
                  type="color"
                  value={profile.accentColor}
                />
              </div>
            </div>
            <button className="primary-button mt-4 w-full sm:w-auto" type="submit">Guardar perfil</button>
          </form>

          <aside className="surface-panel p-4 sm:p-5">
            <p className="eyebrow-label">Vista rapida</p>
            <div className="mt-4 rounded-[32px] bg-[linear-gradient(145deg,#27343d,#4f6573)] p-5 text-white">
              <p className="text-xs uppercase tracking-[0.2em] text-white/70">Perfil publico</p>
              <h3 className="mt-3 text-2xl font-bold">{profile.publicAlias || user?.publicAlias || "Sin alias"}</h3>
              <p className="mt-2 text-sm leading-6 text-white/80">{profile.bio || "Tu bio aparecera aqui cuando la completes."}</p>
              <div className="mt-5 flex items-center gap-3">
                <span className="h-4 w-4 rounded-full border border-white/60" style={{ backgroundColor: profile.accentColor }} />
                <span className="text-sm text-white/80">{profile.accentColor}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[28px] border border-[var(--muted-card-border)] bg-[var(--muted-card-bg)] p-4 text-sm text-[var(--app-subtle-text)]">
              <p className="font-semibold text-[var(--app-text)]">Consejo</p>
              <p className="mt-2 leading-6">Un alias claro y una bio corta ayudan a identificarte mejor en chats privados y grupales.</p>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );

  return (
    <div className="relative h-screen overflow-hidden px-3 py-3 text-[var(--app-text)] sm:px-4 sm:py-4">
      <div className="grid h-full min-h-0 gap-3 grid-rows-[minmax(18rem,42vh)_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-1">
        <aside className="surface-panel flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-[var(--surface-border)] p-4 sm:p-5">
            <div className="rounded-[32px] bg-[linear-gradient(145deg,#27343d,#4f6573)] p-4 text-white shadow-[0_22px_60px_-32px_rgba(15,23,42,0.8)]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={user?.publicAlias || "Usuario"} size="lg" src={user?.profileImageUrl} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-white/70">Habla Mas</p>
                    <h1 className="mt-1 truncate text-lg font-bold">{user?.publicAlias}</h1>
                    <p className="truncate text-xs text-white/70">{user?.publicCode}</p>
                  </div>
                </div>
                <ThemeToggle mode={themeMode} onToggle={() => applyThemeMode(themeMode === "dark" ? "light" : "dark")} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <p className="text-[10px] uppercase text-white/60">Chats</p>
                  <p className="mt-1 text-lg font-semibold">{conversations.length}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <p className="text-[10px] uppercase text-white/60">Grupos</p>
                  <p className="mt-1 text-lg font-semibold">{groupChats.length}</p>
                </div>
                <div className="rounded-2xl bg-white/10 px-3 py-2">
                  <p className="text-[10px] uppercase text-white/60">Online</p>
                  <p className="mt-1 text-lg font-semibold">{onlineContacts}</p>
                </div>
              </div>
            </div>

            <nav className="mt-4 space-y-2">
              <SidebarNavButton
                active={panel === "chats"}
                badge={conversations.length}
                description={panelDescriptions.chats}
                icon={<ChatIcon className="h-5 w-5" />}
                label={panelLabels.chats}
                onClick={() => setPanel("chats")}
              />
              <SidebarNavButton
                active={panel === "groups"}
                badge={groupChats.length}
                description={panelDescriptions.groups}
                icon={<GroupIcon className="h-5 w-5" />}
                label={panelLabels.groups}
                onClick={() => setPanel("groups")}
              />
              <SidebarNavButton
                active={panel === "contacts"}
                badge={contacts.length}
                description={panelDescriptions.contacts}
                icon={<ContactIcon className="h-5 w-5" />}
                label={panelLabels.contacts}
                onClick={() => setPanel("contacts")}
              />
              <SidebarNavButton
                active={panel === "profile"}
                description={panelDescriptions.profile}
                icon={<ProfileIcon className="h-5 w-5" />}
                label={panelLabels.profile}
                onClick={() => setPanel("profile")}
              />

              <Link
                className="group flex w-full items-center gap-3 rounded-[24px] border border-[var(--surface-border-strong)] bg-[var(--surface-bg-strong)] px-4 py-3 transition hover:border-brand-300 hover:bg-[var(--muted-card-bg)]"
                to="/chatbot"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 transition group-hover:bg-brand-100">
                  <BotIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--app-text)]">Chatbot IA</span>
                  <span className="mt-0.5 block truncate text-xs text-[var(--app-subtle-text)]">Asistente separado para consultas y soporte.</span>
                </span>
              </Link>
            </nav>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
            {renderSidebarContent()}
          </div>

          <div className="shrink-0 border-t border-[var(--surface-border)] p-4 sm:p-5">
            <button className="secondary-button w-full" onClick={() => logout().catch(() => undefined)} type="button">
              Salir
            </button>
          </div>
        </aside>

        <main className="surface-panel flex min-h-0 flex-col overflow-hidden">
          {panel === "groups"
            ? renderGroupMain()
            : panel === "chats"
              ? renderChatMain()
              : panel === "contacts"
                ? renderContactsWorkspace()
                : renderProfileWorkspace()}

          {messagingPanel ? (
            <MessageComposer
              attachmentAccept={ATTACHMENT_ACCEPT}
              canSend={canSendMessage}
              disabled={!composerEnabled}
              inputValue={messageInput}
              isRecordingVoice={isRecordingVoice}
              onAttachment={(event) => {
                sendAttachment(event).catch(() => {
                  setStatusText("No fue posible enviar el adjunto.");
                });
              }}
              onChange={(value) => {
                setMessageInput(value);
                if (panel === "chats") {
                  sendTyping(value.trim().length > 0).catch(() => undefined);
                }
              }}
              onSubmit={(event) => {
                sendText(event).catch(() => {
                  setStatusText("No fue posible enviar el mensaje.");
                });
              }}
              onToggleVoice={() => {
                toggleVoiceRecording().catch(() => {
                  setStatusText("No fue posible usar el microfono.");
                  setIsRecordingVoice(false);
                });
              }}
              placeholder={panel === "groups" ? "Escribe al grupo" : "Escribe un mensaje"}
            />
          ) : null}
        </main>
      </div>

      {statusText ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 w-[min(calc(100%-2rem),34rem)] -translate-x-1/2 rounded-2xl bg-[var(--toast-bg)] px-4 py-3 text-sm font-medium text-[var(--toast-text)] shadow-[0_22px_50px_-26px_rgba(15,23,42,0.78)]">
          {statusText}
        </div>
      ) : null}
    </div>
  );
}
