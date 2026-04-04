import { useEffect, useRef, useState } from "react";

interface FaceCaptureModalProps {
  busy?: boolean;
  description: string;
  onCapture: (file: File) => Promise<void>;
  onClose: () => void;
  open: boolean;
  title: string;
}

export function FaceCaptureModal({
  busy = false,
  description,
  onCapture,
  onClose,
  open,
  title
}: FaceCaptureModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorText("Este navegador no permite abrir la camara.");
      return;
    }

    setErrorText(null);

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 960 },
          height: { ideal: 720 }
        },
        audio: false
      })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch(() => {
        setErrorText("No fue posible acceder a la camara.");
      });

    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [open]);

  const capture = async (): Promise<void> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      setErrorText("La camara aun no esta lista.");
      return;
    }

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 540;
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      setErrorText("No fue posible procesar la foto.");
      return;
    }

    context.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setErrorText("No fue posible capturar la foto.");
      return;
    }

    await onCapture(new File([blob], "face-capture.jpg", { type: "image/jpeg" }));
  };

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4">
      <div className="surface-panel w-full max-w-2xl overflow-hidden rounded-[32px] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow-label">Camara</p>
            <h3 className="mt-2 text-xl font-bold text-[var(--app-text)]">{title}</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--app-subtle-text)]">{description}</p>
          </div>
          <button
            className="rounded-2xl border border-[var(--surface-border)] px-3 py-2 text-sm text-[var(--app-subtle-text)] transition hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
            onClick={onClose}
            type="button"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-[28px] border border-[var(--surface-border)] bg-slate-950">
          <video
            autoPlay
            className="aspect-[4/3] w-full object-cover"
            muted
            playsInline
            ref={videoRef}
          />
        </div>

        {errorText ? <p className="mt-4 text-sm text-rose-600">{errorText}</p> : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() => {
              capture().catch(() => {
                setErrorText("No fue posible procesar la captura.");
              });
            }}
            type="button"
          >
            {busy ? "Procesando..." : "Tomar foto"}
          </button>
          <button
            className="rounded-2xl border border-[var(--surface-border)] px-4 py-3 text-sm font-semibold text-[var(--app-subtle-text)] transition hover:bg-[var(--chip-hover)] hover:text-[var(--app-text)]"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
        </div>

        <canvas className="hidden" ref={canvasRef} />
      </div>
    </div>
  );
}
