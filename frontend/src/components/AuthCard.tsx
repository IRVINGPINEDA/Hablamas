import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps ) {
  return (
    <div className="mx-auto w-full max-w-xl rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.9))] p-6 shadow-[0_24px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl sm:p-8">
      <div className="hidden sm:block">
        <p className="eyebrow-label">Habla Mas</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-950">{title}</h1>
        {subtitle ? <p className="mt-3 max-w-lg text-sm leading-6 text-slate-500">{subtitle}</p> : null}
      </div>
      <div className="mt-2 sm:mt-8">{children}</div>
    </div>
  );
}

