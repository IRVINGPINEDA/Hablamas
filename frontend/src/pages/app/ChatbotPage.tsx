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
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#e6edf1,_#f6f8fa_45%,_#edf2f5_100%)] p-4 lg:p-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <header className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Chatbot Habla Mas</h1>
              <p className="text-sm text-slate-500">Preguntas, codigo e imagenes en una sola conversacion.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link className="rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:border-brand-300 hover:text-brand-700" to="/app">
                Volver a chats
              </Link>
              <button className="rounded-lg border border-slate-300 px-3 py-2 text-sm transition hover:border-brand-300 hover:text-brand-700" onClick={clearConversation} type="button">
                Limpiar
              </button>
              <button
                className="rounded-lg bg-brand-900 px-3 py-2 text-sm text-white transition hover:bg-brand-700"
                onClick={() => {
                  logout().then(() => navigate("/login", { replace: true })).catch(() => navigate("/login", { replace: true }));
                }}
                type="button"
              >
                Salir
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Usuario: {user?.publicAlias}</p>
        </header>

        <main className="flex min-h-[72vh] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          <section className="flex-1 space-y-3 overflow-y-auto p-4 lg:p-5">
            {messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">
                Escribe una pregunta, pega codigo o adjunta imagenes para empezar.
              </div>
            ) : null}

            {messages.map((message) => (
              <article
                className={clsx(
                  "max-w-[90%] rounded-2xl px-4 py-3 text-sm lg:max-w-[80%]",
                  message.role === "user" ? "ml-auto bg-brand-600 text-white" : "bg-slate-100 text-slate-900"
                )}
                key={message.id}
              >
                {message.images.length > 0 ? (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {message.images.map((image) => (
                      <a className="block" href={image.previewUrl} key={`${message.id}-${image.name}`} rel="noreferrer" target="_blank">
                        <img alt={image.name} className="h-40 w-full rounded-lg object-contain bg-slate-200/60" src={image.previewUrl} />
                      </a>
                    ))}
                  </div>
                ) : null}

                {splitBlocks(message.content).map((block, index) => (
                  block.type === "code" ? (
                    <div className="mb-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100" key={`${message.id}-${index}`}>
                      {block.language ? <p className="mb-2 text-[10px] uppercase text-slate-400">{block.language}</p> : null}
                      <pre className="whitespace-pre-wrap">
                        <code>{block.value}</code>
                      </pre>
                    </div>
                  ) : (
                    <p className="mb-2 whitespace-pre-wrap leading-relaxed" key={`${message.id}-${index}`}>{block.value}</p>
                  )
                ))}

                <p className={clsx("text-[10px]", message.role === "user" ? "text-brand-100" : "text-slate-500")}>
                  {new Date(message.createdAt).toLocaleTimeString()}
                </p>
              </article>
            ))}
          </section>

          <footer className="border-t border-slate-200 p-4">
            {pendingImages.length > 0 ? (
              <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {pendingImages.map((image) => (
                  <div className="relative overflow-hidden rounded-lg border border-slate-300" key={image.id}>
                    <img alt={image.name} className="h-24 w-full object-contain bg-slate-100" src={image.previewUrl} />
                    <button
                      className="absolute right-1 top-1 rounded bg-black/60 px-2 py-1 text-[10px] text-white"
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
                className="min-h-28 w-full resize-y rounded-xl border border-slate-300 px-4 py-3 transition focus:border-brand-300 focus:outline-none focus:ring-2 focus:ring-brand-100"
                onChange={(event) => setInput(event.target.value)}
                placeholder="Escribe tu pregunta o pega codigo aqui..."
                value={input}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="cursor-pointer rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-700 transition hover:border-brand-300 hover:text-brand-700">
                  Adjuntar imagen
                  <input accept="image/png,image/jpeg,image/webp" className="hidden" multiple onChange={(event) => {
                    addImages(event).catch(() => {
                      setStatusText("No fue posible procesar la imagen.");
                    });
                  }} type="file" />
                </label>
                <button
                  className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canSend}
                  type="submit"
                >
                  {sending ? "Enviando..." : "Enviar al chatbot"}
                </button>
              </div>
            </form>
          </footer>
        </main>

        {statusText ? <div className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white">{statusText}</div> : null}
      </div>
    </div>
  );
}
