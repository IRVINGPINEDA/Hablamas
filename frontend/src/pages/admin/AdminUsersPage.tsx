import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi } from "../../lib/api";

interface AdminUserItem {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  publicAlias: string;
  publicCode: string;
  emailConfirmed: boolean;
  isBlocked: boolean;
  createdAt: string;
}

export function AdminUsersPage( ) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [items, setItems] = useState<AdminUserItem[]>([]);

  const load = async (): Promise<void> => {
    const response = await authApi.get(`/admin/users?page=${page}&pageSize=20&search=${encodeURIComponent(search)}`);
    setTotal(response.data.total);
    setItems(response.data.items as AdminUserItem[]);
  };

  useEffect(() => {
    load().catch(() => undefined);
  }, [page]);

  return (
    <section>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <input
          className="field-input"
          placeholder="Buscar por correo, nombre o codigo"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <button
          className="primary-button lg:min-w-36"
          onClick={() => {
            setPage(1);
            load().catch(() => undefined);
          }}
        >
          Buscar
        </button>
      </div>

      <div className="overflow-x-auto rounded-[28px] border border-white/70 bg-white/80 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.55)]">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50/85">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Usuario</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Email</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Estado</th>
              <th className="px-3 py-2 text-left font-medium text-slate-600">Accion</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white/85">
            {items.map((item) => (
              <tr key={item.id}>
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-900">{item.firstName} {item.lastName}</p>
                  <p className="text-xs text-slate-500">{item.publicAlias} · {item.publicCode}</p>
                </td>
                <td className="px-3 py-2 text-slate-700">{item.email}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs ${item.isBlocked ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {item.isBlocked ? "Bloqueado" : "Activo"}
                  </span>
                  {!item.emailConfirmed ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-xs text-amber-700">Sin verificar</span> : null}
                </td>
                <td className="px-3 py-2">
                  <Link className="secondary-button rounded-xl px-3 py-2 text-xs" to={`/admin/users/${item.id}`}>Ver detalle</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-slate-500">Total: {total}</p>
        <div className="flex items-center gap-2">
          <button className="secondary-button rounded-xl px-3 py-2 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((prev) => prev - 1)}>Anterior</button>
          <span>Pagina {page}</span>
          <button className="secondary-button rounded-xl px-3 py-2 disabled:opacity-40" disabled={page * 20 >= total} onClick={() => setPage((prev) => prev + 1)}>Siguiente</button>
        </div>
      </div>
    </section>
  );
}
