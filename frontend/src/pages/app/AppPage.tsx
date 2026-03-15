import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
type ChatFilter = "all" | "unread" | "online";

interface IconProps {
  className?: string;
}

interface AvatarProps {
  name: string;
  src?: string;
  online?: boolean;
  size?: "md" | "lg";
}

interface RailButtonProps {
  active?: boolean;
  badge?: ReactNode;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

interface ChatFilterChipProps {
  active: boolean;
  label: string;
  onClick: () => void;
}

interface ChatHeaderProps {
  aside?: ReactNode;
  avatar: ReactNode;
  eyebrow: string;
  leadingAction?: ReactNode;
  statusRow?: ReactNode;
  subtitle: ReactNode;
  title: string;
}

interface MessageViewportProps {
  bottomRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  contentRef: RefObject<HTMLDivElement | null>;
  emptyState: ReactNode;
  onScroll: () => void;
  scrollAction?: ReactNode;
  viewportRef: RefObject<HTMLDivElement | null>;
}

interface MessageBubbleProps {
  message: ChatRenderableMessage;
  meta: ReactNode;
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

function MenuIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m7 10 5 5 5-5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function StatusChecks({ className, status }: { className?: string; status: "Sent" | "Delivered" | "Seen" }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 20 20">
      <path d="m4.5 10.2 2.1 2.1 4.1-4.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      {status !== "Sent" ? <path d="m9.2 10.2 2.1 2.1 4.1-4.8" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" /> : null}
    </svg>
  );
}

function SearchIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SettingsIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m10.33 4.32 1.15-1.93a.6.6 0 0 1 1.04 0l1.15 1.93a.6.6 0 0 0 .72.27l2.16-.7a.6.6 0 0 1 .77.48l.3 2.22a.6.6 0 0 0 .48.51l2.2.42a.6.6 0 0 1 .34.98l-1.49 1.67a.6.6 0 0 0-.1.67l1 2a.6.6 0 0 1-.43.86l-2.2.42a.6.6 0 0 0-.48.51l-.3 2.22a.6.6 0 0 1-.77.48l-2.16-.7a.6.6 0 0 0-.72.27l-1.15 1.93a.6.6 0 0 1-1.04 0l-1.15-1.93a.6.6 0 0 0-.72-.27l-2.16.7a.6.6 0 0 1-.77-.48l-.3-2.22a.6.6 0 0 0-.48-.51l-2.2-.42a.6.6 0 0 1-.43-.86l1-2a.6.6 0 0 0-.1-.67L2.36 8.5a.6.6 0 0 1 .34-.98l2.2-.42a.6.6 0 0 0 .48-.51l.3-2.22a.6.6 0 0 1 .77-.48l2.16.7a.6.6 0 0 0 .72-.27Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function DotsIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function InfoIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M12 8h.01M10.75 12h1.25v4h1.25M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SmileIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M8.5 14.5s1.35 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function SendIcon({ className }: IconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="m3 20 18-8L3 4v6l10 2-10 2v6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

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

function RailButton({ active, badge, icon, label, onClick }: RailButtonProps) {
  return (
    <button
      aria-label={label}
      className={clsx(
        "group relative flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--app-subtle-text)] transition",
        active
          ? "bg-[#103529] text-[#7df2b0] shadow-[inset_0_0_0_1px_rgba(37,211,102,0.18)]"
          : "hover:bg-[var(--rail-hover)] hover:text-[var(--app-text)]"
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {badge ? (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1 text-[10px] font-bold text-[#041b10]">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ChatFilterChip({ active, label, onClick }: ChatFilterChipProps) {
  return (
    <button
      className={clsx(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "bg-[#103529] text-[#7df2b0] shadow-[inset_0_0_0_1px_rgba(37,211,102,0.22)]"
          : "bg-[var(--chip-bg)] text-[var(--app-subtle-text)] hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
      )}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function HeaderActionButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--app-subtle-text)] transition hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
      type="button"
    >
      {icon}
    </button>
  );
}

function ChatHeader({ aside, avatar, eyebrow, leadingAction, statusRow, subtitle, title }: ChatHeaderProps) {
  return (
    <header className="shrink-0 border-b border-[var(--surface-border)] bg-[var(--surface-bg-strong)] px-5 py-4 backdrop-blur-xl sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {leadingAction ? <div className="lg:hidden">{leadingAction}</div> : null}
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

function ScrollToBottomButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#25d366] px-4 py-2 text-sm font-semibold text-[#072a18] shadow-[0_16px_30px_-20px_rgba(7,42,24,0.55)] transition hover:bg-[#20bd5c]"
      onClick={onClick}
      type="button"
    >
      <ChevronDownIcon className="h-4 w-4" />
      <span>{count > 1 ? `${count} nuevos mensajes` : "Nuevo mensaje"}</span>
    </button>
  );
}

function MessageViewport({ bottomRef, children, contentRef, emptyState, onScroll, scrollAction, viewportRef }: MessageViewportProps) {
  const hasContent = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <section className="relative min-h-0 flex-1">
      <div
        className="chat-pattern min-h-0 h-full overflow-y-auto bg-[var(--chat-canvas)] px-4 py-5 sm:px-6"
        onScroll={onScroll}
        ref={viewportRef}
      >
        <div className="flex min-h-full flex-col justify-end gap-3" ref={contentRef}>
          {hasContent ? children : emptyState}
          <div ref={bottomRef} />
        </div>
      </div>
      {scrollAction ? (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
          {scrollAction}
        </div>
      ) : null}
    </section>
  );
}

function MessageBubble({ message, meta, own, renderContent, senderLabel }: MessageBubbleProps) {
  const attachment = message.type !== "text";

  return (
    <article className={clsx("flex w-full", own ? "justify-end" : "justify-start")}>
      <div
        className={clsx(
          "w-fit max-w-[min(92%,44rem)] border shadow-[0_18px_30px_-24px_rgba(0,0,0,0.35)]",
          own
            ? "rounded-[18px] rounded-br-[6px] border-transparent bg-[linear-gradient(135deg,var(--bubble-own-from),var(--bubble-own-to))] text-[var(--bubble-own-text)]"
            : "rounded-[18px] rounded-bl-[6px] border-[var(--bubble-peer-border)] bg-[var(--bubble-peer-bg)] text-[var(--bubble-peer-text)]",
          attachment ? "px-3 py-3" : "px-4 py-3.5"
        )}
      >
        {senderLabel ? <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">{senderLabel}</p> : null}
        {renderContent(message)}
        <div className={clsx("mt-2 flex items-center gap-1 text-[10px] font-medium", own ? "justify-end text-[var(--bubble-own-muted)]" : "justify-start text-[var(--bubble-peer-muted)]")}>{meta}</div>
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
    <footer className="shrink-0 border-t border-[var(--surface-border)] bg-[var(--composer-bg)] px-4 py-3 backdrop-blur-xl sm:px-5">
      <form className="flex items-end gap-2" onSubmit={onSubmit}>
        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--app-subtle-text)] transition hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
          disabled={disabled}
          type="button"
        >
          <SmileIcon className="h-5 w-5" />
        </button>

        <label className={clsx("flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-[var(--app-subtle-text)] transition hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]", disabled ? "pointer-events-none opacity-60" : undefined)}>
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
          <input accept={attachmentAccept} className="hidden" onChange={onAttachment} type="file" />
        </label>

        <div className="flex min-w-0 flex-1 items-end rounded-[26px] bg-[var(--composer-input-bg)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <textarea
            className="max-h-32 min-h-[24px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--input-placeholder)] disabled:cursor-not-allowed"
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (canSend && !disabled) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            placeholder={placeholder}
            rows={1}
            value={inputValue}
          />
        </div>

        <button
          className={clsx(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition",
            isRecordingVoice
              ? "bg-rose-500 text-white hover:bg-rose-600"
              : "text-[var(--app-subtle-text)] hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
          )}
          disabled={disabled}
          onClick={onToggleVoice}
          type="button"
        >
          <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
            <path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3Zm0 0v-1m0 14v4m-5-9a5 5 0 0 0 10 0" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
          </svg>
        </button>

        <button
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#25d366] text-[#041b10] shadow-[0_16px_30px_-18px_rgba(37,211,102,0.45)] transition hover:bg-[#31e476] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSend || disabled}
          type="submit"
        >
          <SendIcon className="h-5 w-5" />
        </button>
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
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme() ?? "dark");
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
  const [unreadByConversation, setUnreadByConversation] = useState<Record<string, number>>({});
  const [chatSearchQuery, setChatSearchQuery] = useState("");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [messageInput, setMessageInput] = useState("");
  const [connectionState, setConnectionState] = useState<HubConnectionState>(HubConnectionState.Disconnected);
  const [addingCode, setAddingCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedGroupMemberIds, setSelectedGroupMemberIds] = useState<string[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [pendingNewMessageCount, setPendingNewMessageCount] = useState(0);
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
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const previousThreadKeyRef = useRef("");
  const previousMessageCountRef = useRef(0);
  const forceScrollRef = useRef(false);
  const stickToBottomRef = useRef(true);

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
  const activeMessages = useMemo(
    () => (panel === "groups" ? groupMessages : panel === "chats" ? messages : []),
    [groupMessages, messages, panel]
  );
  const filteredConversations = useMemo(() => {
    const query = chatSearchQuery.trim().toLowerCase();

    return conversations.filter((conversation) => {
      const name = (conversation.contact.alias || conversation.contact.publicAlias).toLowerCase();
      const preview = getMessagePreview(conversation.lastMessage).toLowerCase();
      const unreadCount = unreadByConversation[conversation.id] ?? 0;
      const matchesQuery = query.length === 0 || name.includes(query) || preview.includes(query);

      if (!matchesQuery) {
        return false;
      }

      if (chatFilter === "unread") {
        return unreadCount > 0;
      }

      if (chatFilter === "online") {
        return Boolean(presenceByUser[conversation.contact.id]);
      }

      return true;
    });
  }, [chatFilter, chatSearchQuery, conversations, presenceByUser, unreadByConversation]);
  const activeThreadKey = useMemo(
    () => (panel === "groups" ? `group:${selectedGroupId ?? "none"}` : panel === "chats" ? `chat:${selectedConversationId ?? "none"}` : panel),
    [panel, selectedConversationId, selectedGroupId]
  );

  const applyThemeMode = (mode: ThemeMode): void => {
    setThemeMode(mode);
    setProfile((prev) => ({ ...prev, theme: toThemeNumber(mode) }));
  };

  const isNearBottom = (): boolean => {
    const container = messagesContainerRef.current;
    if (!container) {
      return true;
    }

    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance < 120;
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth"): void => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    setPendingNewMessageCount(0);
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
    if (typeof window === "undefined") {
      return;
    }

    const syncSidebarState = () => {
      if (window.innerWidth >= 1024) {
        setSidebarOpen(true);
      }
    };

    syncSidebarState();
    window.addEventListener("resize", syncSidebarState);

    return () => window.removeEventListener("resize", syncSidebarState);
  }, []);

  useEffect(() => {
    if (!messagingPanel) {
      return;
    }

    forceScrollRef.current = true;
    stickToBottomRef.current = true;
    setShowScrollToBottom(false);
    setPendingNewMessageCount(0);

    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }, [messagingPanel, selectedConversationId, selectedGroupId]);

  useEffect(() => {
    if (!selectedConversationId) {
      return;
    }

    setUnreadByConversation((prev) => {
      if (!(selectedConversationId in prev)) {
        return prev;
      }

      const next = { ...prev };
      delete next[selectedConversationId];
      return next;
    });
  }, [selectedConversationId]);

  useLayoutEffect(() => {
    if (!messagingPanel) {
      return;
    }

    const threadChanged = previousThreadKeyRef.current !== activeThreadKey;
    const previousCount = threadChanged ? 0 : previousMessageCountRef.current;
    const nextCount = activeMessages.length;
    const addedMessages = Math.max(0, nextCount - previousCount);

    if (forceScrollRef.current || threadChanged) {
      scrollToBottom("auto");
      forceScrollRef.current = false;
    } else if (addedMessages > 0) {
      if (stickToBottomRef.current || isNearBottom()) {
        scrollToBottom("smooth");
      } else {
        setPendingNewMessageCount((prev) => prev + addedMessages);
        setShowScrollToBottom(true);
      }
    }

    previousThreadKeyRef.current = activeThreadKey;
    previousMessageCountRef.current = nextCount;
  }, [activeMessages.length, activeThreadKey, messagingPanel]);

  useEffect(() => {
    if (!messagingPanel || typeof ResizeObserver === "undefined") {
      return;
    }

    const content = messagesContentRef.current;
    if (!content) {
      return;
    }

    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        scrollToBottom("auto");
      }
    });

    observer.observe(content);
    return () => observer.disconnect();
  }, [activeThreadKey, messagingPanel]);

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
    const nextTheme = getStoredTheme() ?? (Number(response.data.theme) === 1 ? "light" : "dark");

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
      const isActiveConversation = selectedConversationRef.current === payload.conversationId;
      const shouldFollow = isActiveConversation ? isNearBottom() : false;

      if (!isActiveConversation && payload.message.senderId !== user.id) {
        setUnreadByConversation((prev) => ({
          ...prev,
          [payload.conversationId]: (prev[payload.conversationId] ?? 0) + 1
        }));
      }

      if (isActiveConversation) {
        stickToBottomRef.current = shouldFollow;
      }

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
    forceScrollRef.current = true;
    stickToBottomRef.current = true;
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
      forceScrollRef.current = true;
      stickToBottomRef.current = true;
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
    forceScrollRef.current = true;
    stickToBottomRef.current = true;
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

  const handleMessagesScroll = (): void => {
    const nearBottom = isNearBottom();
    stickToBottomRef.current = nearBottom;

    if (nearBottom) {
      setShowScrollToBottom(false);
      setPendingNewMessageCount(0);
    }
  };

  const renderOwnMessageMeta = (message: MessageDto) => (
    <>
      <span>{formatMessageTime(message.createdAt)}</span>
      <StatusChecks
        className={clsx(
          "h-3.5 w-3.5",
          message.status === "Seen" ? "text-sky-300" : "text-[var(--bubble-own-muted)]"
        )}
        status={message.status}
      />
    </>
  );

  const mobileSidebarToggle = (
    <button
      aria-label="Abrir conversaciones"
      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] text-[var(--app-text)] shadow-sm transition hover:border-brand-300 lg:hidden"
      onClick={() => setSidebarOpen(true)}
      type="button"
    >
      <MenuIcon className="h-5 w-5" />
    </button>
  );

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
          aside={(
            <>
              {typingByConversation[currentConversation.id] ? (
                <div className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-800">
                  {typingByConversation[currentConversation.id]} esta escribiendo...
                </div>
              ) : null}
              <HeaderActionButton icon={<SearchIcon className="h-5 w-5" />} label="Buscar en chat" />
              <HeaderActionButton icon={<InfoIcon className="h-5 w-5" />} label="Informacion del chat" />
              <HeaderActionButton icon={<DotsIcon className="h-5 w-5" />} label="Mas acciones" />
            </>
          )}
          avatar={<Avatar name={contactName} online={online} size="lg" src={currentConversation.contact.profileImageUrl} />}
          eyebrow="Chat privado"
          leadingAction={mobileSidebarToggle}
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
          bottomRef={bottomRef}
          contentRef={messagesContentRef}
          emptyState={(
            <EmptyMessagingState
              description="Todavia no hay mensajes en esta conversacion."
              eyebrow="Mensajes"
              title="Empieza el chat"
            />
          )}
          onScroll={handleMessagesScroll}
          scrollAction={showScrollToBottom ? <ScrollToBottomButton count={pendingNewMessageCount} onClick={() => scrollToBottom("smooth")} /> : null}
          viewportRef={messagesContainerRef}
        >
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              meta={message.senderId === user?.id ? renderOwnMessageMeta(message) : <span>{formatMessageTime(message.createdAt)}</span>}
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
          aside={(
            <>
              {groupMembers.slice(0, 3).map((member) => (
                <span className="rounded-full border border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] px-3 py-1 text-xs font-semibold text-[var(--app-subtle-text)]" key={member.id}>
                  {member.publicAlias}
                </span>
              ))}
              <HeaderActionButton icon={<SearchIcon className="h-5 w-5" />} label="Buscar en grupo" />
              <HeaderActionButton icon={<DotsIcon className="h-5 w-5" />} label="Mas acciones" />
            </>
          )}
          avatar={<Avatar name={currentGroup.name} size="lg" />}
          eyebrow="Grupo activo"
          leadingAction={mobileSidebarToggle}
          statusRow={<span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{groupMembers.length} miembros</span>}
          subtitle={<p className="truncate">Conversacion grupal compartida</p>}
          title={currentGroup.name}
        />

        <MessageViewport
          bottomRef={bottomRef}
          contentRef={messagesContentRef}
          emptyState={(
            <EmptyMessagingState
              description="Aun no hay mensajes en este grupo."
              eyebrow="Mensajes"
              title="Todo listo para empezar"
            />
          )}
          onScroll={handleMessagesScroll}
          scrollAction={showScrollToBottom ? <ScrollToBottomButton count={pendingNewMessageCount} onClick={() => scrollToBottom("smooth")} /> : null}
          viewportRef={messagesContainerRef}
        >
          {groupMessages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              meta={<span>{formatMessageTime(message.createdAt)}</span>}
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
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--surface-border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--app-text)]">Chats</h2>
                <p className="mt-1 text-sm text-[var(--app-subtle-text)]">Conversaciones activas y recientes.</p>
              </div>
              <div className="flex items-center gap-1">
                <HeaderActionButton icon={<SearchIcon className="h-5 w-5" />} label="Buscar chats" />
                <HeaderActionButton icon={<DotsIcon className="h-5 w-5" />} label="Mas opciones" />
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-[var(--search-bg)] px-4 py-3">
              <SearchIcon className="h-4 w-4 text-[var(--app-subtle-text)]" />
              <input
                className="w-full bg-transparent text-sm text-[var(--app-text)] outline-none placeholder:text-[var(--input-placeholder)]"
                onChange={(event) => setChatSearchQuery(event.target.value)}
                placeholder="Buscar o iniciar un chat"
                value={chatSearchQuery}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <ChatFilterChip active={chatFilter === "all"} label="Todos" onClick={() => setChatFilter("all")} />
              <ChatFilterChip active={chatFilter === "unread"} label="No leidos" onClick={() => setChatFilter("unread")} />
              <ChatFilterChip active={chatFilter === "online"} label="En linea" onClick={() => setChatFilter("online")} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredConversations.length === 0 ? (
              <div className="mx-3 mt-3 rounded-[22px] border border-dashed border-[var(--surface-border-strong)] bg-[var(--muted-card-bg)] p-5 text-sm text-[var(--app-subtle-text)]">
                No hay chats que coincidan con el filtro actual.
              </div>
            ) : null}

            {filteredConversations.map((conversation) => {
              const selected = selectedConversationId === conversation.id;
              const contactName = conversation.contact.alias || conversation.contact.publicAlias;
              const previewDate = conversation.lastMessageAt ?? conversation.createdAt;
              const unreadCount = unreadByConversation[conversation.id] ?? 0;

              return (
                <button
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition",
                    selected
                      ? "bg-[var(--chat-item-active)] shadow-[inset_0_0_0_1px_rgba(37,211,102,0.16)]"
                      : "hover:bg-[var(--chat-item-hover)]"
                  )}
                  key={conversation.id}
                  onClick={() => {
                    setSelectedConversationId(conversation.id);
                    if (typeof window !== "undefined" && window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  type="button"
                >
                  <Avatar
                    name={contactName}
                    online={presenceByUser[conversation.contact.id]}
                    src={conversation.contact.profileImageUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className={clsx("truncate text-[15px] font-medium", selected ? "text-[var(--app-text)]" : "text-[var(--app-text)]")}>{contactName}</p>
                      <span className={clsx("shrink-0 text-[11px]", unreadCount > 0 ? "text-[#25d366]" : "text-[var(--app-subtle-text)]")}>
                        {formatSidebarTime(previewDate)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <p className={clsx("min-w-0 flex-1 truncate text-[13px]", unreadCount > 0 ? "text-[var(--app-text)]" : "text-[var(--app-subtle-text)]")}>
                        {getMessagePreview(conversation.lastMessage)}
                      </p>
                      {unreadCount > 0 ? (
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#25d366] px-1.5 py-0.5 text-[10px] font-bold text-[#041b10]">
                          {unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    if (panel === "groups") {
      return (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-[var(--surface-border)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--app-text)]">Grupos</h2>
                <p className="mt-1 text-sm text-[var(--app-subtle-text)]">Salas compartidas y colaborativas.</p>
              </div>
              <HeaderActionButton icon={<DotsIcon className="h-5 w-5" />} label="Mas opciones" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <form className="rounded-[22px] bg-[var(--muted-card-bg)] p-4" onSubmit={(event) => {
              createGroup(event).catch(() => {
                setStatusText("No fue posible crear el grupo.");
              });
            }}>
              <p className="text-sm font-semibold text-[var(--app-text)]">Nuevo grupo</p>
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

            <div className="mt-4 space-y-1">
              {groupChats.map((group) => {
                const selected = selectedGroupId === group.id;

                return (
                  <button
                    className={clsx(
                      "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition",
                      selected ? "bg-[var(--chat-item-active)]" : "hover:bg-[var(--chat-item-hover)]"
                    )}
                    key={group.id}
                    onClick={() => {
                      setSelectedGroupId(group.id);
                      if (typeof window !== "undefined" && window.innerWidth < 1024) {
                        setSidebarOpen(false);
                      }
                    }}
                    type="button"
                  >
                    <Avatar name={group.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[15px] font-medium text-[var(--app-text)]">{group.name}</p>
                        <span className="rounded-full bg-[var(--chip-bg)] px-2 py-0.5 text-[10px] font-semibold text-[var(--app-subtle-text)]">
                          {group.memberCount}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[13px] text-[var(--app-subtle-text)]">
                        {getMessagePreview(group.lastMessage)}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
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
    <div className="relative h-screen overflow-hidden bg-[var(--app-background)] text-[var(--app-text)]">
      {sidebarOpen ? <button aria-label="Cerrar menu" className="absolute inset-0 z-20 bg-slate-950/40 lg:hidden" onClick={() => setSidebarOpen(false)} type="button" /> : null}
      <div className="relative h-full min-h-0 lg:grid lg:grid-cols-[72px_380px_minmax(0,1fr)] xl:grid-cols-[72px_420px_minmax(0,1fr)]">
        <aside
          className={clsx(
            "absolute inset-y-0 left-0 z-30 grid min-h-0 w-[min(96vw,500px)] grid-cols-[72px_minmax(0,1fr)] overflow-hidden border-r border-[var(--surface-border)] bg-[var(--sidebar-shell)] transition-transform duration-300 lg:static lg:w-auto lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-[105%] lg:translate-x-0"
          )}
        >
          <div className="flex min-h-0 flex-col items-center border-r border-[var(--surface-border)] bg-[var(--rail-bg)] px-3 py-4">
            <button
              className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#103529] text-[#7df2b0] shadow-[inset_0_0_0_1px_rgba(37,211,102,0.16)]"
              onClick={() => setPanel("profile")}
              type="button"
            >
              {user?.profileImageUrl ? (
                <img alt={user.publicAlias} className="h-12 w-12 rounded-2xl object-cover" src={user.profileImageUrl} />
              ) : (
                <span className="text-sm font-bold">{getInitials(user?.publicAlias || "HM")}</span>
              )}
            </button>

            <div className="flex flex-1 flex-col items-center gap-3">
              <RailButton
                active={panel === "chats"}
                badge={Object.values(unreadByConversation).reduce((sum, value) => sum + value, 0) || undefined}
                icon={<ChatIcon className="h-5 w-5" />}
                label="Chats"
                onClick={() => {
                  setPanel("chats");
                  setSidebarOpen(true);
                }}
              />
              <RailButton
                active={panel === "groups"}
                badge={groupChats.length || undefined}
                icon={<GroupIcon className="h-5 w-5" />}
                label="Grupos"
                onClick={() => {
                  setPanel("groups");
                  setSidebarOpen(true);
                }}
              />
              <RailButton
                active={panel === "contacts"}
                badge={contacts.length || undefined}
                icon={<ContactIcon className="h-5 w-5" />}
                label="Contactos"
                onClick={() => {
                  setPanel("contacts");
                  setSidebarOpen(true);
                }}
              />
              <Link aria-label="Chatbot IA" className="flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--app-subtle-text)] transition hover:bg-[var(--rail-hover)] hover:text-[var(--app-text)]" to="/chatbot">
                <span className="sr-only">Chatbot IA</span>
                <span>
                  <BotIcon className="h-5 w-5" />
                </span>
              </Link>
            </div>

            <div className="mt-auto flex flex-col items-center gap-3">
              <button
                aria-label={themeMode === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--app-subtle-text)] transition hover:bg-[var(--rail-hover)] hover:text-[var(--app-text)]"
                onClick={() => applyThemeMode(themeMode === "dark" ? "light" : "dark")}
                type="button"
              >
                {themeMode === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
              </button>
              <RailButton
                active={panel === "profile"}
                icon={<ProfileIcon className="h-5 w-5" />}
                label="Perfil"
                onClick={() => {
                  setPanel("profile");
                  setSidebarOpen(true);
                }}
              />
              <RailButton
                icon={<SettingsIcon className="h-5 w-5" />}
                label="Salir"
                onClick={() => logout().catch(() => undefined)}
              />
            </div>
          </div>

          <div className="flex min-h-0 flex-col bg-[var(--sidebar-bg)]">
            <div className="flex items-center justify-between border-b border-[var(--surface-border)] px-5 py-4 lg:hidden">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[var(--app-subtle-text)]">Habla Mas</p>
                <p className="truncate text-sm text-[var(--app-text)]">{user?.publicAlias}</p>
              </div>
              <HeaderActionButton icon={<DotsIcon className="h-5 w-5" />} label="Mas opciones" />
            </div>
            {renderSidebarContent()}
          </div>
        </aside>

        <main className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--conversation-shell)]">
          {panel !== "chats" && panel !== "groups" ? (
            <div className="absolute left-4 top-4 z-10 lg:hidden">
              {mobileSidebarToggle}
            </div>
          ) : null}
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
