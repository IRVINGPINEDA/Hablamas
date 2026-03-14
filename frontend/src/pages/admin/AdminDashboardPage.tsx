import { useEffect, useState } from "react";
import { authApi } from "../../lib/api";

export function AdminDashboardPage( ) {
  const [stats, setStats] = useState({ total: 0, blocked: 0, unverified: 0 });

  useEffect(() => {
    const load = async () => {
      const response = await authApi.get("/admin/users?page=1&pageSize=200");
      const items = response.data.items as Array<{ isBlocked: boolean; emailConfirmed: boolean }>;

      setStats({
        total: response.data.total,
        blocked: items.filter((item) => item.isBlocked).length,
        unverified: items.filter((item) => !item.emailConfirmed).length
      });
    };

    load().catch(() => undefined);
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Total usuarios</p>
          <p className="mt-3 text-4xl font-extrabold text-slate-900">{stats.total}</p>
        </article>
        <article className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Bloqueados</p>
          <p className="mt-3 text-4xl font-extrabold text-rose-600">{stats.blocked}</p>
        </article>
        <article className="rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
          <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Sin verificar</p>
          <p className="mt-3 text-4xl font-extrabold text-amber-600">{stats.unverified}</p>
        </article>
      </div>

      <aside className="rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,#27343d,#4f6573)] p-5 text-white shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
        <p className="text-xs uppercase tracking-[0.2em] text-white/70">Resumen operativo</p>
        <h2 className="mt-3 text-2xl font-bold">Estado general del sistema</h2>
        <p className="mt-3 text-sm leading-6 text-white/80">
          Desde aqui puedes supervisar altas, revisar verificaciones pendientes y actuar rapido sobre usuarios bloqueados.
        </p>
        <div className="mt-5 rounded-[24px] bg-white/10 p-4 text-sm leading-6 text-white/85">
          Mantener baja la cantidad de usuarios sin verificar ayuda a reducir soporte manual y friccion en el acceso.
        </div>
      </aside>
    </div>
  );
}

