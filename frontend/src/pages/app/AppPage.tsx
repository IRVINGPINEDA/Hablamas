import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { HubConnection, HubConnectionState } from "@microsoft/signalr";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";
import { createChatConnection } from "../../lib/signalr";
import type {
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

type Panel = "chats" | "groups" | "contacts" | "profile";

const panelLabels: Record<Panel, string> = {
  chats: "Chats",
  groups: "Grupos",
  contacts: "Contactos",
  profile: "Perfil"
};

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
  const [profile, setProfile] = useState<ProfileForm>({
    bio: "",
    publicAlias: "",
    theme: 1,
    accentColor: "#5f7888"
  });
  const [statusText, setStatusText] = useState<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);
  const contactsRef = useRef<ContactDto[]>([]);

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

  const sendImage = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await authApi.post("/uploads/message-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

    if (panel === "groups") {
      if (!selectedGroupId) {
        return;
      }

      await authApi.post(`/group-chats/${selectedGroupId}/messages`, {
        type: "image",
        imageUrl: uploadResponse.data.url,
        clientMessageId: crypto.randomUUID()
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

    await connection.invoke("SendImage", selectedConversationId, crypto.randomUUID(), uploadResponse.data.url);
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
            const isImage = message.type === "image";
            return (
              <div
                key={message.id}
                className={clsx(
                  "max-w-[88%] rounded-[24px] text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)] sm:max-w-[78%]",
                  own ? "ml-auto bg-brand-600 text-white" : "border border-white/70 bg-white text-slate-800",
                  isImage ? "p-2.5" : "break-words px-4 py-3.5"
                )}
              >
                {isImage ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block">
                    <img
                      alt="Mensaje"
                      className="max-h-[28rem] w-auto max-w-full rounded-xl object-contain"
                      src={message.imageUrl}
                    />
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                )}
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
            const isImage = message.type === "image";
            return (
              <div
                key={message.id}
                className={clsx(
                  "max-w-[90%] rounded-[24px] text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)] sm:max-w-[82%]",
                  own ? "ml-auto bg-brand-600 text-white" : "border border-white/70 bg-white text-slate-800",
                  isImage ? "p-2.5" : "break-words px-4 py-3.5"
                )}
              >
                {!own ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">{message.senderAlias}</p> : null}
                {isImage ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block">
                    <img
                      alt="Mensaje grupo"
                      className="max-h-[28rem] w-auto max-w-full rounded-xl object-contain"
                      src={message.imageUrl}
                    />
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                )}
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
                  {conversation.lastMessage.type === "image" ? "[imagen]" : conversation.lastMessage.text}
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
                  <p className="mt-1 truncate text-xs text-slate-500">{group.lastMessage.type === "image" ? "[imagen]" : group.lastMessage.text}</p>
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
                <form className="flex flex-col gap-3 lg:flex-row lg:items-center" onSubmit={(event) => {
                  sendText(event).catch(() => {
                    setStatusText("No fue posible enviar el mensaje.");
                  });
                }}>
                  <input
                    className="field-input flex-1 text-base"
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
                    Foto
                    <input className="hidden" accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => {
                      sendImage(event).catch(() => {
                        setStatusText("No fue posible enviar imagen.");
                      });
                    }} />
                  </label>
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
