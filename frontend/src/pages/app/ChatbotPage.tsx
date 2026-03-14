import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import axios from "axios";
import clsx from "clsx";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../lib/api";

type ChatRole = "user" | "assistant";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  images: Array<{ name: string; previewUrl: string }>;
}

interface PendingImage {
  id: string;
  name: string;
  contentType: string;
  base64Data: string;
  previewUrl: string;
}

interface ContentBlock {
  type: "text" | "code";
  value: string;
  language?: string;
}

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImages = 4;

interface ApiProblemResponse {
  title?: string;
  detail?: string;
}

function extractApiError(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return "No fue posible obtener respuesta del chatbot.";
  }

  if (error.response?.status === 429) {
    return "Se alcanzo el limite de solicitudes/cuota del proveedor de IA. Revisa tu plan y vuelve a intentar.";
  }

  const data = error.response?.data as ApiProblemResponse | undefined;
  return data?.detail ?? data?.title ?? "No fue posible obtener respuesta del chatbot.";
}

function splitBlocks(content: string): ContentBlock[] {
  const regex = /```([\w.+-]*)\n?([\s\S]*?)```/g;
  const blocks: ContentBlock[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(content);

  while (match) {
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        value: content.slice(lastIndex, match.index)
      });
    }

    blocks.push({
      type: "code",
      language: match[1] || undefined,
      value: match[2]
    });

    lastIndex = regex.lastIndex;
    match = regex.exec(content);
  }

  if (lastIndex < content.length) {
    blocks.push({
      type: "text",
      value: content.slice(lastIndex)
    });
  }

  return blocks.length > 0 ? blocks : [{ type: "text", value: content }];
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("No fue posible leer la imagen."));
    reader.readAsDataURL(file);
  });
}

export function ChatbotPage( ) {
  const navigate = useNavigate();
  const { logout, user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);

  const canSend = useMemo(() => !sending && (input.trim().length > 0 || pendingImages.length > 0), [sending, input, pendingImages.length]);

  const addImages = async (event: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (files.length === 0) {
      return;
    }

    const availableSlots = Math.max(maxImages - pendingImages.length, 0);
    if (availableSlots === 0) {
      setStatusText(`Solo puedes adjuntar ${maxImages} imagenes por mensaje.`);
      return;
    }

    const candidates = files.slice(0, availableSlots);
    const invalid = candidates.find((file) => !allowedTypes.has(file.type));
    if (invalid) {
      setStatusText(`Formato no permitido: ${invalid.name}. Usa jpg, png o webp.`);
      return;
    }

    const loaded = await Promise.all(
      candidates.map(async (file) => {
        const dataUrl = await readFileAsDataUrl(file);
        const commaIndex = dataUrl.indexOf(",");
        if (commaIndex < 0) {
          throw new Error(`No se pudo leer ${file.name}`);
        }

        return {
          id: crypto.randomUUID(),
          name: file.name,
          contentType: file.type,
          base64Data: dataUrl.slice(commaIndex + 1),
          previewUrl: dataUrl
        } satisfies PendingImage;
      })
    );

    setPendingImages((prev) => [...prev, ...loaded]);
    setStatusText(null);
  };

  const removePendingImage = (id: string): void => {
    setPendingImages((prev) => prev.filter((item) => item.id !== id));
  };

  const clearConversation = (): void => {
    setMessages([]);
    setPendingImages([]);
    setInput("");
    setStatusText(null);
  };

  const sendMessage = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const text = input.trim();
    const images = pendingImages;
    setInput("");
    setPendingImages([]);
    setSending(true);
    setStatusText(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text || "Imagen adjunta",
      createdAt: new Date().toISOString(),
      images: images.map((image) => ({ name: image.name, previewUrl: image.previewUrl }))
    };

    setMessages((prev) => [...prev, userMessage]);

    try {
      const history = messages.slice(-12).map((message) => ({
        role: message.role,
        content: message.content
      }));

      const response = await authApi.post("/chatbot/message", {
        message: text,
        history,
        images: images.map((image) => ({
          name: image.name,
          contentType: image.contentType,
          base64Data: image.base64Data
        }))
      });

      const reply = (response.data.reply as string | undefined)?.trim() || "No hubo respuesta del modelo.";
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        createdAt: new Date().toISOString(),
        images: []
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error: unknown) {
      setStatusText(extractApiError(error));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen px-3 py-3 sm:px-4 sm:py-4 lg:px-6 lg:py-6">
      <div className="mx-auto flex max-w-[1760px] flex-col gap-4">
        <header className="surface-panel overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="eyebrow-label">Asistente IA</p>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Chatbot Habla Mas</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Preguntas, codigo e imagenes en una sola conversacion con una interfaz mas comoda para trabajar.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Mensajes</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{messages.length}</p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Imagenes listas</p>
                <p className="mt-2 text-2xl font-bold text-slate-950">{pendingImages.length}</p>
              </div>
              <div className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-xs uppercase text-slate-400">Usuario</p>
                <p className="mt-2 truncate text-base font-bold text-slate-950">{user?.publicAlias}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <main className="surface-panel flex min-h-[72vh] flex-col overflow-hidden">
            <header className="border-b border-white/70 bg-white/78 px-4 py-4 backdrop-blur sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="eyebrow-label">Conversacion actual</p>
                  <p className="mt-2 text-sm leading-6 text-slate-500">El asistente mantiene el contexto reciente y admite bloques de codigo e imagenes adjuntas.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link className="secondary-button" to="/app">
                    Volver a chats
                  </Link>
                  <button className="secondary-button" onClick={clearConversation} type="button">
                    Limpiar
                  </button>
                  <button
                    className="primary-button bg-brand-900 hover:bg-brand-700"
                    onClick={() => {
                      logout().then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true }));
                    }}
                    type="button"
                  >
                    Salir
                  </button>
                </div>
              </div>
            </header>

            <section className="flex-1 space-y-4 overflow-y-auto bg-[linear-gradient(180deg,rgba(248,250,252,0.78),rgba(255,255,255,0.72))] p-4 sm:p-6">
              {messages.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-brand-200 bg-white/75 p-5 text-sm text-slate-600">
                  <p className="text-lg font-semibold text-slate-900">Todo listo para empezar</p>
                  <p className="mt-2 leading-6">Escribe una pregunta, pega codigo o adjunta imagenes para iniciar una conversacion mas completa.</p>
                </div>
              ) : null}

              {messages.map((message) => (
                <article
                  className={clsx(
                    "max-w-[92%] rounded-[24px] px-4 py-3 text-sm shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)] sm:max-w-[84%]",
                    message.role === "user" ? "ml-auto bg-brand-600 text-white" : "border border-white/70 bg-white text-slate-900"
                  )}
                  key={message.id}
                >
                  {message.images.length > 0 ? (
                    <div className="mb-3 grid grid-cols-2 gap-2">
                      {message.images.map((image) => (
                        <a className="block" href={image.previewUrl} key={`${message.id}-${image.name}`} rel="noreferrer" target="_blank">
                          <img alt={image.name} className="h-40 w-full rounded-2xl object-contain bg-slate-200/60" src={image.previewUrl} />
                        </a>
                      ))}
                    </div>
                  ) : null}

                  {splitBlocks(message.content).map((block, index) => (
                    block.type === "code" ? (
                      <div className="mb-2 overflow-x-auto rounded-2xl bg-slate-900 p-3 text-xs text-slate-100" key={`${message.id}-${index}`}>
                        {block.language ? <p className="mb-2 text-[10px] uppercase text-slate-400">{block.language}</p> : null}
                        <pre className="whitespace-pre-wrap">
                          <code>{block.value}</code>
                        </pre>
                      </div>
                    ) : (
                      <p className="mb-2 whitespace-pre-wrap leading-relaxed" key={`${message.id}-${index}`}>{block.value}</p>
                    )
                  ))}

                  <p className={clsx("text-[10px] font-medium", message.role === "user" ? "text-brand-100" : "text-slate-500")}>
                    {new Date(message.createdAt).toLocaleTimeString()}
                  </p>
                </article>
              ))}
            </section>

            <footer className="border-t border-white/70 bg-white/82 p-4 sm:p-5">
              {pendingImages.length > 0 ? (
                <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {pendingImages.map((image) => (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white" key={image.id}>
                      <img alt={image.name} className="h-24 w-full object-contain bg-slate-100" src={image.previewUrl} />
                      <button
                        className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white"
                        onClick={() => removePendingImage(image.id)}
                        type="button"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <form className="space-y-3" onSubmit={(event) => {
                sendMessage(event).catch(() => {
                  setSending(false);
                  setStatusText("No fue posible enviar el mensaje.");
                });
              }}>
                <textarea
                  className="field-textarea min-h-32"
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Escribe tu pregunta o pega codigo aqui..."
                  value={input}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <label className="secondary-button cursor-pointer">
                    Adjuntar imagen
                    <input accept="image/png,image/jpeg,image/webp" className="hidden" multiple onChange={(event) => {
                      addImages(event).catch(() => {
                        setStatusText("No fue posible procesar la imagen.");
                      });
                    }} type="file" />
                  </label>
                  <button
                    className="primary-button sm:min-w-52"
                    disabled={!canSend}
                    type="submit"
                  >
                    {sending ? "Enviando..." : "Enviar al chatbot"}
                  </button>
                </div>
              </form>
            </footer>
          </main>

          <aside className="surface-panel p-4 sm:p-5">
            <p className="eyebrow-label">Guia rapida</p>
            <div className="mt-4 space-y-4">
              <article className="rounded-[24px] bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Buenas practicas</p>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                  <li>Pide contexto, codigo o explicaciones en el mismo hilo para mantener continuidad.</li>
                  <li>Adjunta capturas o imagenes si necesitas analisis visual.</li>
                  <li>Usa bloques de codigo para que la respuesta salga mas ordenada.</li>
                </ul>
              </article>

              <article className="rounded-[24px] bg-brand-50/80 p-4">
                <p className="text-sm font-semibold text-brand-900">Estado de la sesion</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{sending ? "El modelo esta generando una respuesta." : "Listo para recibir una nueva consulta."}</p>
              </article>

              <article className="rounded-[24px] border border-dashed border-slate-200 p-4 text-sm leading-6 text-slate-600">
                El historial reciente se reutiliza automaticamente, asi que puedes pedir correcciones o continuar una idea sin repetir todo desde cero.
              </article>
            </div>
          </aside>
        </div>

        {statusText ? <div className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white">{statusText}</div> : null}
      </div>
    </div>
  );
}
