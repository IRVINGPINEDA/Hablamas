import type { ReactNode } from "react";
import clsx from "clsx";

interface AuthShellProps {
  title: string;
  subtitle: string;
  accent?: string;
  children: ReactNode;
}

const highlights = [
  "Mensajeria privada y grupal en tiempo real",
  "Chatbot multimodal con texto e imagenes",
  "Diseño optimizado para escritorio y celular"
];

export function AuthShell({ title, subtitle, accent = "Acceso seguro", children }: AuthShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
      <div className="soft-grid pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,_rgba(95,120,136,0.22),_transparent_60%)]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl gap-5 lg:grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="surface-panel relative hidden overflow-hidden px-5 py-6 sm:px-8 sm:py-8 lg:block lg:px-10 lg:py-10">
          <div className="absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.18),_transparent_65%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div className="max-w-xl">
              <p className="eyebrow-label">{accent}</p>
              <h1 className="mt-4 max-w-lg text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Habla Mas
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
                Una experiencia de chat pensada para conversar, organizarte y apoyarte con IA sin perder claridad visual.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {highlights.map((item, index) => (
                <article
                  className={clsx(
                    "rounded-[24px] border border-white/70 bg-white/72 p-4 shadow-[0_12px_30px_-24px_rgba(15,23,42,0.7)] backdrop-blur",
                    index === 1 ? "sm:-translate-y-4" : ""
                  )}
                  key={item}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-600">0{index + 1}</p>
                  <p className="mt-3 text-sm font-medium leading-6 text-slate-700">{item}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="surface-panel flex w-full items-center justify-center px-3 py-4 sm:px-5 sm:py-5">
          <div className="w-full max-w-xl">
            <div className="mb-6 px-2 sm:hidden">
              <p className="eyebrow-label">{accent}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{subtitle}</p>
            </div>
            {children}
          </div>
        </section>
      </div>
    </div>
  );
}
