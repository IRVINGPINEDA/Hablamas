import type { ReactNode } from "react";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps ) {
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-slate-200/90 bg-white/95 p-8 shadow-lg shadow-slate-300/40 backdrop-blur-sm transition-shadow duration-200 hover:shadow-xl hover:shadow-slate-300/50">
      <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-slate-500">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

