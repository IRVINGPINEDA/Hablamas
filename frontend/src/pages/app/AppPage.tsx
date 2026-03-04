import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { HubConnection, HubConnectionState } from "@microsoft/signalr";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";
import { createChatConnection } from "../../lib/signalr";
import type { ContactDto, ConversationSummary, MessageDto } from "../../types";

interface ProfileForm {
  bio: string;
  publicAlias: string;
  theme: number;
  accentColor: string;
}

type Panel = "chats" | "contacts" | "profile";

export function AppPage( ) {
  const { user, logout, refreshProfile } = useAuth();
  const [panel, setPanel] = useState<Panel>("chats");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [contacts, setContacts] = useState<ContactDto[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [typingByConversation, setTypingByConversation] = useState<Record<string, string>>({});
  const [presenceByUser, setPresenceByUser] = useState<Record<string, boolean>>({});
  const [messageInput, setMessageInput] = useState("");
  const [connectionState, setConnectionState] = useState<HubConnectionState>(HubConnectionState.Disconnected);
  const [addingCode, setAddingCode] = useState("");
  const [profile, setProfile] = useState<ProfileForm>({
    bio: "",
    publicAlias: "",
    theme: 1,
    accentColor: "#0ea5e9"
  });
  const [statusText, setStatusText] = useState<string | null>(null);
  const selectedConversationRef = useRef<string | null>(null);
  const connectionRef = useRef<HubConnection | null>(null);

  const currentConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId]
  );

  useEffect(() => {
    selectedConversationRef.current = selectedConversationId;
  }, [selectedConversationId]);

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

  const loadProfile = async (): Promise<void> => {
    const response = await authApi.get("/profile/me");
    setProfile({
      bio: response.data.bio ?? "",
      publicAlias: response.data.publicAlias ?? "",
      theme: response.data.theme,
      accentColor: response.data.accentColor ?? "#0ea5e9"
    });
  };

  const loadMessages = async (conversationId: string): Promise<void> => {
    const response = await authApi.get(`/chats/${conversationId}/messages?page=1&pageSize=50`);
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

  useEffect(() => {
    if (!user) {
      return;
    }

    loadSidebar().catch(() => {
      setStatusText("No fue posible cargar chats y contactos.");
    });
    loadProfile().catch(() => {
      setStatusText("No fue posible cargar el perfil.");
    });
  }, [user]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }

    loadMessages(selectedConversationId).catch(() => {
      setStatusText("No fue posible cargar mensajes.");
    });
  }, [selectedConversationId]);

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

      const contact = contacts.find((item) => item.contactUser.id === payload.userId);
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
      } catch {
        setStatusText("No fue posible iniciar SignalR.");
      }
    };

    connect().catch(() => {
      setStatusText("No fue posible iniciar SignalR.");
    });

    return () => {
      connection.stop().catch(() => undefined);
      setConnectionState(HubConnectionState.Disconnected);
    };
  }, [user, contacts]);

  useEffect(() => {
    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected || !selectedConversationId) {
      return;
    }

    connection.invoke("JoinConversation", selectedConversationId).catch(() => {
      setStatusText("No se pudo unir a la conversacion.");
    });
  }, [selectedConversationId]);

  const sendText = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    if (!selectedConversationId || !messageInput.trim()) {
      return;
    }

    const connection = connectionRef.current;
    if (!connection || connection.state !== HubConnectionState.Connected) {
      setStatusText("SignalR no conectado.");
      return;
    }

    const text = messageInput.trim();
    setMessageInput("");

    await connection.invoke("SendText", selectedConversationId, crypto.randomUUID(), text);
  };

  const sendTyping = async (isTyping: boolean): Promise<void> => {
    if (!selectedConversationId) {
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
    if (!file || !selectedConversationId) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    const uploadResponse = await authApi.post("/uploads/message-image", formData, {
      headers: {
        "Content-Type": "multipart/form-data"
      }
    });

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

  return (
    <div className="min-h-screen bg-slate-50 p-4 lg:p-8" style={{ borderTop: `5px solid ${profile.accentColor}` }}>
      <div className="mx-auto flex max-w-7xl gap-4 lg:gap-6">
        <aside className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Habla Mas</h1>
              <p className="text-xs text-slate-500">{user?.publicAlias} ({user?.publicCode})</p>
            </div>
            <button className="rounded-lg border border-slate-300 px-3 py-1 text-sm text-slate-700" onClick={() => logout().catch(() => undefined)}>
              Salir
            </button>
          </div>

          <nav className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-slate-100 p-1">
            {([
              { key: "chats", label: "Chats" },
              { key: "contacts", label: "Contactos" },
              { key: "profile", label: "Perfil" }
            ] as const).map((item) => (
              <button
                key={item.key}
                className={clsx(
                  "rounded-lg px-3 py-2 text-sm font-medium",
                  panel === item.key ? "bg-white text-brand-700 shadow" : "text-slate-600"
                )}
                onClick={() => setPanel(item.key)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <Link className="mt-3 block rounded-xl border border-brand-200 bg-brand-50 px-3 py-2 text-center text-sm font-medium text-brand-700" to="/chatbot">
            Abrir chatbot AI
          </Link>

          {panel === "chats" ? (
            <div className="mt-4 space-y-2">
              {conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  className={clsx(
                    "w-full rounded-xl border px-3 py-3 text-left",
                    selectedConversationId === conversation.id ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-white"
                  )}
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{conversation.contact.alias || conversation.contact.publicAlias}</p>
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
          ) : null}

          {panel === "contacts" ? (
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
          ) : null}

          {panel === "profile" ? (
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
          ) : null}
        </aside>

        <main className="flex min-h-[75vh] flex-1 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {currentConversation ? (
            <>
              <header className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm text-slate-500">Conversacion privada</p>
                <h2 className="text-xl font-semibold text-slate-900">{currentConversation.contact.alias || currentConversation.contact.publicAlias}</h2>
                <p className="text-xs text-slate-500">
                  Estado SignalR: {HubConnectionState[connectionState]}
                  {typingByConversation[currentConversation.id] ? ` | ${typingByConversation[currentConversation.id]} esta escribiendo...` : ""}
                </p>
              </header>

              <section className="flex-1 space-y-3 overflow-y-auto p-5">
                {messages.map((message) => {
                  const own = message.senderId === user?.id;

                  return (
                    <div key={message.id} className={clsx("max-w-[75%] rounded-2xl px-4 py-3 text-sm", own ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-800")}>
                      {message.type === "image" ? (
                        <a href={message.imageUrl} target="_blank" rel="noreferrer" className="block">
                          <img alt="Mensaje" className="max-h-64 w-full rounded-xl object-cover" src={message.imageUrl} />
                        </a>
                      ) : (
                        <p>{message.text}</p>
                      )}
                      <p className={clsx("mt-2 text-[10px]", own ? "text-brand-100" : "text-slate-500")}>{new Date(message.createdAt).toLocaleTimeString()} {own ? `· ${message.status}` : ""}</p>
                    </div>
                  );
                })}
              </section>

              <footer className="border-t border-slate-200 p-4">
                <form className="flex items-center gap-2" onSubmit={(event) => {
                  sendText(event).catch(() => {
                    setStatusText("No fue posible enviar el mensaje.");
                  });
                }}>
                  <input
                    className="w-full rounded-xl border border-slate-300 px-4 py-2"
                    placeholder="Escribe un mensaje"
                    value={messageInput}
                    onChange={(event) => {
                      setMessageInput(event.target.value);
                      sendTyping(event.target.value.trim().length > 0).catch(() => undefined);
                    }}
                  />
                  <label className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-600">
                    Foto
                    <input className="hidden" accept="image/png,image/jpeg,image/webp" type="file" onChange={(event) => {
                      sendImage(event).catch(() => {
                        setStatusText("No fue posible enviar imagen.");
                      });
                    }} />
                  </label>
                  <button className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white" type="submit">Enviar</button>
                </form>
              </footer>
            </>
          ) : (
            <div className="m-auto text-center text-slate-500">
              <p className="text-lg font-medium">Selecciona un chat</p>
              <p className="text-sm">Agrega contactos por codigo publico para comenzar.</p>
            </div>
          )}
        </main>
      </div>

      {statusText ? <div className="mx-auto mt-4 max-w-7xl rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">{statusText}</div> : null}
    </div>
  );
}




