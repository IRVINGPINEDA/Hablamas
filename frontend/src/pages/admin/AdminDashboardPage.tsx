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
    <div className="grid gap-4 md:grid-cols-3">
      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs uppercase text-slate-500">Total usuarios</p>
        <p className="mt-2 text-3xl font-semibold text-slate-900">{stats.total}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs uppercase text-slate-500">Bloqueados</p>
        <p className="mt-2 text-3xl font-semibold text-rose-600">{stats.blocked}</p>
      </article>
      <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs uppercase text-slate-500">Sin verificar</p>
        <p className="mt-2 text-3xl font-semibold text-amber-600">{stats.unverified}</p>
      </article>
    </div>
  );
}

