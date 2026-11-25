import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowUpRight, Blocks, Filter, RefreshCw, ShieldCheck } from "lucide-react";
import api from "../services/api";

const types = [
  ["", "Semua aktivitas"], ["record_uploaded", "Upload rekam medis"],
  ["access_granted", "Akses diberikan"], ["access_revoked", "Akses dicabut"],
  ["doctor_registered", "Dokter terdaftar"], ["doctor_verified", "Dokter diverifikasi"],
  ["patient_data_accessed", "Data pasien diakses"],
  ["record_versioned", "Versi record dibuat"], ["record_revoked", "Record dinonaktifkan"],
  ["emergency_access_granted", "Emergency access diberikan"], ["emergency_access_revoked", "Emergency access dicabut"],
  ["emergency_access_requested", "Emergency access diajukan"], ["record_revocation_requested", "Penonaktifan diajukan"],
  ["record_revocation_rejected", "Penonaktifan ditolak"], ["patient_records_accessed", "Rekam medis diakses dokter"],
  ["emergency_access_used", "Emergency access digunakan"],
];
const short = (value) => value ? `${value.slice(0, 8)}…${value.slice(-6)}` : "—";

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [filters, setFilters] = useState({ startDate: "", endDate: "", type: "", patient: "", doctor: "" });
  const [appliedFilters, setAppliedFilters] = useState({ startDate: "", endDate: "", type: "", patient: "", doctor: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const params = Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value));
      const response = await api.get("/admin/audit-trail", { params });
      setLogs(response.data.logs || []);
    } catch (e) {
      setError(e.response?.data?.message || "Gagal memuat riwayat aktivitas.");
    } finally { setLoading(false); }
  }, [appliedFilters]);

  useEffect(() => { load(); }, [load]);
  const update = (key) => (event) => setFilters((current) => ({ ...current, [key]: event.target.value }));

  return <section className="mt-6 space-y-5">
    <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-teal-950 to-teal-800 p-6 text-white shadow-sm md:p-8">
      <div className="flex items-start gap-4"><div className="rounded-2xl bg-white/10 p-3"><ShieldCheck size={25}/></div><div><p className="text-xs font-semibold uppercase tracking-[.18em] text-teal-200">Security & Blockchain</p><h2 className="mt-1 text-2xl font-bold">Audit Trail</h2><p className="mt-2 max-w-2xl text-sm text-slate-200">Telusuri aktivitas akses, upload, dan verifikasi dokter. Data medis tidak ditampilkan di halaman ini.</p></div></div>
      <div className="mt-6 flex flex-wrap gap-3 text-xs text-teal-100"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"><Blocks size={14}/> Event blockchain</span><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2"><Activity size={14}/> Log aplikasi</span></div>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-800"><Filter size={16} className="text-teal-700"/> Filter aktivitas</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-xs font-medium text-slate-600">Dari tanggal<input type="date" value={filters.startDate} onChange={update("startDate")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600">Sampai tanggal<input type="date" value={filters.endDate} onChange={update("endDate")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"/></label>
        <label className="text-xs font-medium text-slate-600">Jenis aktivitas<select value={filters.type} onChange={update("type")} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">{types.map(([value, label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs font-medium text-slate-600">Wallet pasien<input placeholder="0x…" value={filters.patient} onChange={update("patient")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs"/></label>
        <label className="text-xs font-medium text-slate-600">Wallet dokter<input placeholder="0x…" value={filters.doctor} onChange={update("doctor")} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-xs"/></label>
      </div>
      <button onClick={() => setAppliedFilters(filters)} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"><RefreshCw size={15} className={loading ? "animate-spin" : ""}/> Terapkan filter</button>
    </div>

    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="font-semibold text-slate-900">Riwayat aktivitas</h3><p className="mt-1 text-xs text-slate-500">{logs.length} aktivitas ditampilkan, maksimal 500</p></div></div>
      {error && <p className="m-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
      {loading ? <div className="p-10 text-center text-sm text-slate-500">Memuat aktivitas…</div> : !error && logs.length === 0 ? <div className="p-12 text-center"><Activity className="mx-auto text-slate-300"/><p className="mt-3 font-medium text-slate-700">Belum ada aktivitas yang cocok</p><p className="mt-1 text-sm text-slate-500">Coba ubah filter atau lakukan aktivitas di MediChain.</p></div> : <div className="divide-y divide-slate-100">{logs.map((log)=><article key={log.id} className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(150px,1fr)_2fr_1fr] md:items-center">
        <div><p className="text-sm font-semibold text-slate-800">{new Date(log.timestamp).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p><p className="mt-1 text-xs text-slate-500">{log.source === "blockchain" ? `Block ${log.blockNumber}` : "Aplikasi"}</p></div>
        <div><p className="text-sm font-medium text-slate-900">{log.description}</p><p className="mt-1 text-xs text-slate-500">{log.actorName} · {log.actorRole}{log.actorWallet ? ` · ${short(log.actorWallet)}` : ""}</p><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500"><span>Pasien: {short(log.patientWallet)}</span><span>Dokter: {short(log.doctorWallet)}</span></div></div>
        <div className="md:text-right">{log.transactionHash ? <span className="inline-flex items-center gap-1 font-mono text-xs text-teal-700" title={log.transactionHash}>{short(log.transactionHash)}<ArrowUpRight size={13}/></span> : <span className="text-xs text-slate-400">Tanpa transaction hash</span>}</div>
      </article>)}</div>}
    </div>
  </section>;
}
