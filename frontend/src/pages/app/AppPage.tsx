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
        <div className="m-auto text-center text-slate-500">
          <p className="text-lg font-medium">Selecciona una conversacion</p>
          <p className="text-sm">Agrega contactos para comenzar.</p>
        </div>
      );
    }

    return (
      <>
        <header className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">Chat privado</p>
          <h2 className="text-lg font-semibold text-slate-900">{currentConversation.contact.alias || currentConversation.contact.publicAlias}</h2>
          <p className="text-xs text-slate-500">
            SignalR: {HubConnectionState[connectionState]}
            {typingByConversation[currentConversation.id] ? ` | ${typingByConversation[currentConversation.id]} esta escribiendo...` : ""}
          </p>
        </header>

        <section className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((message) => {
            const own = message.senderId === user?.id;
            return (
              <div key={message.id} className={clsx("max-w-[78%] break-words rounded-2xl px-4 py-3 text-sm", own ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-800")}>
                {message.type === "image" ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block">
                    <img alt="Mensaje" className="max-h-64 w-full rounded-xl object-cover" src={message.imageUrl} />
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                )}
                <p className={clsx("mt-2 text-[10px]", own ? "text-brand-100" : "text-slate-500")}>
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
        <div className="m-auto text-center text-slate-500">
          <p className="text-lg font-medium">Selecciona un grupo</p>
          <p className="text-sm">Crea uno nuevo desde el panel lateral.</p>
        </div>
      );
    }

    return (
      <>
        <header className="border-b border-slate-200 px-5 py-4">
          <p className="text-xs text-slate-500">Grupo</p>
          <h2 className="text-lg font-semibold text-slate-900">{currentGroup.name}</h2>
          <p className="text-xs text-slate-500">
            {groupMembers.length} miembros
          </p>
        </header>

        <section className="min-h-0 flex-1 space-y-3 overflow-y-auto p-5">
          {groupMessages.map((message) => {
            const own = message.senderId === user?.id;
            return (
              <div key={message.id} className={clsx("max-w-[82%] break-words rounded-2xl px-4 py-3 text-sm", own ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-800")}>
                {!own ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-700">{message.senderAlias}</p> : null}
                {message.type === "image" ? (
                  <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block">
                    <img alt="Mensaje grupo" className="max-h-64 w-full rounded-xl object-cover" src={message.imageUrl} />
                  </a>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                )}
                <p className={clsx("mt-2 text-[10px]", own ? "text-brand-100" : "text-slate-500")}>
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
        <div className="mt-4 space-y-2">
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={clsx(
                "w-full rounded-xl border px-4 py-3 text-left",
                selectedConversationId === conversation.id ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"
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
        <div className="mt-4 space-y-3">
          <form className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3" onSubmit={(event) => {
            createGroup(event).catch(() => {
              setStatusText("No fue posible crear el grupo.");
            });
          }}>
            <p className="text-xs font-semibold uppercase text-slate-500">Nuevo grupo</p>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Nombre del grupo"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
            />
            <div className="max-h-32 space-y-1 overflow-auto rounded-lg border border-slate-200 bg-white p-2">
              {contacts.length === 0 ? <p className="text-xs text-slate-500">Agrega contactos primero.</p> : null}
              {contacts.map((contact) => (
                <label key={contact.id} className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={selectedGroupMemberIds.includes(contact.contactUser.id)}
                    onChange={() => toggleGroupMember(contact.contactUser.id)}
                  />
                  <span>{contact.alias || contact.contactUser.publicAlias}</span>
                </label>
              ))}
            </div>
            <button className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white" type="submit">
              Crear grupo
            </button>
          </form>

          <div className="space-y-2">
            {groupChats.map((group) => (
              <button
                key={group.id}
                className={clsx(
                  "w-full rounded-xl border px-4 py-3 text-left",
                  selectedGroupId === group.id ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"
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
        <div className="mt-4 space-y-3">
          <form className="flex gap-2" onSubmit={(event) => {
            addContactByCode(event).catch(() => {
              setStatusText("No fue posible agregar el contacto.");
            });
          }}>
            <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Codigo publico" value={addingCode} onChange={(event) => setAddingCode(event.target.value.toUpperCase())} />
            <button className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white" type="submit">Agregar</button>
          </form>

          {contacts.map((contact) => (
            <div key={contact.id} className="rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-900">{contact.alias || contact.contactUser.publicAlias}</p>
              <p className="text-xs text-slate-500">Codigo: {contact.contactUser.publicCode}</p>
              <input
                className="mt-2 w-full rounded-lg border border-slate-300 px-2 py-1 text-xs"
                placeholder="Alias local"
                defaultValue={contact.alias ?? ""}
                onBlur={(event) => {
                  updateAlias(contact.id, event.target.value).catch(() => {
                    setStatusText("No fue posible actualizar alias.");
                  });
                }}
              />
            </div>
          ))}
        </div>
      );
    }

    return (
      <form className="mt-4 space-y-3" onSubmit={(event) => {
        saveProfile(event).catch(() => {
          setStatusText("No fue posible actualizar el perfil.");
        });
      }}>
        <label className="text-xs font-medium text-slate-600" htmlFor="profile-image">Foto de perfil</label>
        <input id="profile-image" type="file" accept="image/png,image/jpeg,image/webp" className="block w-full text-xs" onChange={(event) => {
          uploadProfileImage(event).catch(() => {
            setStatusText("No fue posible subir la foto.");
          });
        }} />

        <input className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Apodo publico" value={profile.publicAlias} onChange={(event) => setProfile((prev) => ({ ...prev, publicAlias: event.target.value }))} />
        <textarea className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Bio" value={profile.bio} onChange={(event) => setProfile((prev) => ({ ...prev, bio: event.target.value }))} />

        <div className="grid grid-cols-2 gap-2">
          <select className="rounded-lg border border-slate-300 px-3 py-2 text-sm" value={profile.theme} onChange={(event) => setProfile((prev) => ({ ...prev, theme: Number(event.target.value) }))}>
            <option value={1}>Claro</option>
            <option value={2}>Oscuro</option>
          </select>
          <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" type="color" value={profile.accentColor} onChange={(event) => setProfile((prev) => ({ ...prev, accentColor: event.target.value }))} />
        </div>

        <button className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white" type="submit">Guardar perfil</button>
      </form>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dce4ea,_#f6f8fa_45%,_#e9eef2_100%)] p-4 lg:p-9">
      <div className="mx-auto max-w-[1700px] overflow-hidden rounded-[30px] border border-brand-100 bg-white shadow-2xl">
        <div className="flex h-[88vh] flex-col lg:flex-row">
          <aside className="w-full border-b border-slate-200 bg-slate-50 p-5 lg:flex lg:w-[430px] lg:flex-col lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Habla Mas</h1>
                <p className="text-sm text-slate-500">{user?.publicAlias} ({user?.publicCode})</p>
              </div>
              <button className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700" onClick={() => logout().catch(() => undefined)}>
                Salir
              </button>
            </div>

            <nav className="mt-4 grid grid-cols-2 gap-2">
              <button className={clsx("rounded-lg px-3 py-2 text-sm font-semibold", panel === "chats" ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700")} onClick={() => setPanel("chats")}>Chats</button>
              <button className={clsx("rounded-lg px-3 py-2 text-sm font-semibold", panel === "groups" ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700")} onClick={() => setPanel("groups")}>Grupos</button>
              <button className={clsx("rounded-lg px-3 py-2 text-sm font-semibold", panel === "contacts" ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700")} onClick={() => setPanel("contacts")}>Contactos</button>
              <button className={clsx("rounded-lg px-3 py-2 text-sm font-semibold", panel === "profile" ? "bg-brand-600 text-white" : "border border-slate-300 text-slate-700")} onClick={() => setPanel("profile")}>Perfil</button>
            </nav>

            <Link className="mt-2 block rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm font-semibold text-brand-700" to="/chatbot">
              Chatbot IA
            </Link>

            <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
              {renderSidebarContent()}
            </div>
          </aside>

          <main className="flex min-h-0 flex-1 flex-col bg-white">
            {panel === "groups" ? renderGroupMain() : panel === "chats" ? renderChatMain() : (
              <div className="m-auto text-center text-slate-500">
                <p className="text-xl font-medium">{panel === "contacts" ? "Gestiona tus contactos" : "Perfil de usuario"}</p>
                <p className="text-base">{panel === "contacts" ? "Agrega por codigo, cambia alias y crea grupos." : "Personaliza tu cuenta y apariencia."}</p>
              </div>
            )}

            {(panel === "chats" || panel === "groups") ? (
              <footer className="border-t border-slate-200 p-5">
                <form className="flex items-center gap-3" onSubmit={(event) => {
                  sendText(event).catch(() => {
                    setStatusText("No fue posible enviar el mensaje.");
                  });
                }}>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base"
                    placeholder={panel === "groups" ? "Escribe al grupo" : "Escribe un mensaje"}
                    value={messageInput}
                    onChange={(event) => {
                      setMessageInput(event.target.value);
                      if (panel === "chats") {
                        sendTyping(event.target.value.trim().length > 0).catch(() => undefined);
                      }
                    }}
                  />
                  <label className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-600">
                    Foto
                    <input className="hidden" accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => {
                      sendImage(event).catch(() => {
                        setStatusText("No fue posible enviar imagen.");
                      });
                    }} />
                  </label>
                  <button className="rounded-xl bg-brand-600 px-5 py-2.5 font-semibold text-white" type="submit">Enviar</button>
                </form>
              </footer>
            ) : null}
          </main>
        </div>
      </div>

      {statusText ? <div className="mx-auto mt-4 max-w-[1700px] rounded-xl bg-brand-900 px-4 py-2 text-sm text-white">{statusText}</div> : null}
    </div>
  );
}
