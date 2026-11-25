import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Clock3, RefreshCw, X } from "lucide-react";
import api from "../services/api";
import { grantEmergencyAccess, revokeEmergencyAccess } from "../services/blockchain";

export default function EmergencyAccessPanel({ role, walletAddress, authorizedPatients = [] }) {
  const [requests, setRequests] = useState([]);
  const [patientId, setPatientId] = useState("");
  const [durationHours, setDurationHours] = useState("1");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [recordsByPatient, setRecordsByPatient] = useState({});
  const [patientCandidates, setPatientCandidates] = useState([]);
  const [liveAuthorizedPatients, setLiveAuthorizedPatients] = useState([]);
  const [loadingPatient, setLoadingPatient] = useState(null);
  const [revocationReasons, setRevocationReasons] = useState({});
  const [recordNotice, setRecordNotice] = useState("");
  const activePatients = liveAuthorizedPatients.length ? liveAuthorizedPatients : authorizedPatients;
  const emergencyPatients = [...new Map([...patientCandidates, ...activePatients].map((patient) => [patient.id, patient])).values()];
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (role !== "admin") return;
    setLoading(true); setError("");
    try { const { data } = await api.get("/admin/emergency-access-requests"); setRequests(data.requests || []); }
    catch (e) { setError(e.response?.data?.message || "Gagal memuat permintaan darurat."); }
    finally { setLoading(false); }
  }, [role]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (role !== "doctor") return;
    api.get("/doctor/emergency-patient-candidates").then(({ data }) => setPatientCandidates(data.patients || [])).catch(() => setPatientCandidates([]));
    api.get("/doctor/patients").then(({ data }) => setLiveAuthorizedPatients(data.patients || [])).catch(() => setLiveAuthorizedPatients(authorizedPatients));
  }, [role]);

  const submit = async (event) => {
    event.preventDefault(); setError(""); setNotice("");
    try {
      const { data } = await api.post("/doctor/emergency-access-requests", { patientId: Number(patientId), durationHours: Number(durationHours), reason });
      setNotice(data.message); setReason(""); setPatientId("");
    } catch (e) { setError(e.response?.data?.message || e.message || "Gagal mengirim permintaan."); }
  };

  const review = async (item, decision) => {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      let transactionHash = "";
      if (decision === "approved") {
        if (!walletAddress) throw new Error("Hubungkan wallet admin owner kontrak terlebih dahulu.");
        const tx = await grantEmergencyAccess(walletAddress, item.patient_wallet, item.doctor_wallet, item.duration_hours, item.reason);
        transactionHash = tx.transactionHash;
      }
      const { data } = await api.patch(`/admin/emergency-access-requests/${item.id}`, { decision, transactionHash });
      setNotice(data.message); await load();
    } catch (e) { setError(e.response?.data?.message || e.reason || e.message || "Gagal meninjau permintaan."); }
    finally { setBusyId(null); }
  };

  const revoke = async (item) => {
    setBusyId(item.id); setError(""); setNotice("");
    try {
      if (!walletAddress) throw new Error("Hubungkan wallet admin owner kontrak terlebih dahulu.");
      const tx = await revokeEmergencyAccess(walletAddress, item.patient_wallet, item.doctor_wallet);
      const { data } = await api.patch(`/admin/emergency-access-requests/${item.id}/revoke`, { transactionHash: tx.transactionHash });
      setNotice(data.message); await load();
    } catch (e) { setError(e.response?.data?.message || e.reason || e.message || "Gagal mencabut emergency access."); }
    finally { setBusyId(null); }
  };

  const loadPatientRecords = async (patient) => {
    setLoadingPatient(patient.id); setError("");
    try { const { data } = await api.get(`/doctor/patients/${patient.id}/records`); setRecordsByPatient((current) => ({ ...current, [patient.id]: data.records || [] })); }
    catch (e) { setError(e.response?.data?.message || "Izin akses tidak aktif atau data tidak dapat dimuat."); }
    finally { setLoadingPatient(null); }
  };

  const requestRecordRevocation = async (patient, record) => {
    setError(""); setRecordNotice("");
    try {
      const reason = revocationReasons[record.transaction_hash] || "";
      const { data } = await api.post("/doctor/record-revocation-requests", { patientId: patient.id, transactionHash: record.transaction_hash, reason });
      setRecordNotice(data.message);
      setRevocationReasons((current) => ({ ...current, [record.transaction_hash]: "" }));
    } catch (e) { setError(e.response?.data?.message || "Gagal mengajukan penonaktifan record."); }
  };

  return <section className="mt-6 space-y-5">
    <div className="rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-6 md:p-8">
      <div className="flex gap-4"><span className="rounded-2xl bg-amber-100 p-3 text-amber-800"><AlertTriangle size={24}/></span><div><p className="text-xs font-bold uppercase tracking-widest text-amber-800">Security & Blockchain</p><h2 className="mt-1 text-2xl font-bold text-slate-900">Emergency Access</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Akses darurat harus memiliki alasan, persetujuan admin, batas waktu on-chain, dan tercatat di Audit Trail. Ini tidak menggantikan proses klinis atau kebijakan rumah sakit.</p></div></div>
    </div>
    {error && <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    {notice && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</p>}
    {role === "doctor" && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-slate-900">Ajukan akses darurat</h3>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700">Pasien<select required value={patientId} onChange={(e)=>setPatientId(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="">Pilih pasien</option>{emergencyPatients.map((p)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Durasi<select value={durationHours} onChange={(e)=>setDurationHours(e.target.value)} className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"><option value="1">1 jam</option><option value="6">6 jam</option><option value="12">12 jam</option><option value="24">24 jam</option></select></label></div>
      <label className="block text-sm font-medium text-slate-700">Alasan medis<input required minLength={20} maxLength={1000} value={reason} onChange={(e)=>setReason(e.target.value)} placeholder="Jelaskan kebutuhan akses dalam situasi darurat (min. 20 karakter)" className="mt-1.5 block w-full rounded-xl border border-slate-200 px-3 py-2.5"/></label>
      <button disabled={!patientId || reason.trim().length<20} className="rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Kirim untuk peninjauan admin</button>
    </form>}
    {recordNotice && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">{recordNotice}</p>}
    {role === "doctor" && <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold text-slate-900">Rekam medis yang dapat diakses</h3><p className="mt-1 text-xs text-slate-500">Daftar mengikuti izin blockchain aktif, termasuk emergency access yang belum kedaluwarsa.</p><div className="mt-4 space-y-3">{activePatients.map((patient)=><article key={patient.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><p className="font-medium text-slate-800">{patient.full_name}</p><button onClick={()=>loadPatientRecords(patient)} disabled={loadingPatient===patient.id} className="rounded-lg border px-3 py-2 text-xs font-semibold">{loadingPatient===patient.id?"Memuatâ€¦":"Lihat record"}</button></div>{recordsByPatient[patient.id]&&<div className="mt-3 space-y-2">{recordsByPatient[patient.id].length===0?<p className="text-xs text-slate-500">Belum ada metadata record.</p>:recordsByPatient[patient.id].map((record)=><div key={record.transaction_hash} className="rounded-lg bg-slate-50 p-3 text-xs"><p className="font-semibold">{record.category} Â· Versi {record.version_number}</p><p className="mt-1">{record.description||"Tanpa deskripsi"}{record.change_reason?` Â· Revisi: ${record.change_reason}`:""}</p><p className="mt-1 break-all font-mono text-slate-500">Commitment: {record.commitment}</p><p className="mt-1 break-all font-mono text-slate-500">CID: {record.cid}</p><p className="mt-1">Tanda tangan: {record.signature?`signed by ${record.signed_by}`:"unsigned"}</p><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={revocationReasons[record.transaction_hash]||""} onChange={(e)=>setRevocationReasons((current)=>({...current,[record.transaction_hash]:e.target.value}))} minLength={5} maxLength={1000} placeholder="Alasan usulan penonaktifan" className="min-w-0 flex-1 rounded-lg border px-2 py-1.5"/><button onClick={()=>requestRecordRevocation(patient,record)} disabled={(revocationReasons[record.transaction_hash]||"").trim().length<5} className="rounded-lg border border-amber-300 px-3 py-1.5 font-semibold text-amber-800 disabled:opacity-50">Ajukan penonaktifan</button></div></div>)}</div>}</article>)}</div>{activePatients.length===0&&<p className="mt-4 text-sm text-slate-500">Belum ada pasien dengan izin aktif.</p>}</div>}
    {role === "admin" && <div className="rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="font-semibold text-slate-900">Permintaan peninjauan</h3><p className="mt-1 text-xs text-slate-500">Persetujuan memerlukan wallet admin pemilik smart contract.</p></div><button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><RefreshCw size={14} className={loading?"animate-spin":""}/> Muat ulang</button></div>
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Memuatâ€¦</p> : requests.length===0 ? <p className="p-8 text-center text-sm text-slate-500">Belum ada permintaan.</p> : <div className="divide-y divide-slate-100">{requests.map((item)=><article key={item.id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.doctor_name} â†’ {item.patient_name}</p><p className="mt-1 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("id-ID")} Â· maksimal {item.duration_hours} jam</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status==="pending"?"bg-amber-100 text-amber-800":item.status==="approved"?"bg-emerald-100 text-emerald-800":item.status==="revoked"?"bg-slate-200 text-slate-700":"bg-slate-100 text-slate-600"}`}>{item.status}</span></div><p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{item.reason}</p>{item.status==="pending"&&<div className="mt-3 flex gap-2"><button disabled={busyId===item.id} onClick={()=>review(item,"approved")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Check size={14}/> Setujui on-chain</button><button disabled={busyId===item.id} onClick={()=>review(item,"rejected")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"><X size={14}/> Tolak</button></div>}{role==="admin"&&item.status==="approved"&&<button disabled={busyId===item.id} onClick={()=>revoke(item)} className="mt-3 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Cabut akses darurat sekarang</button>}{item.transaction_hash&&<p className="mt-2 break-all font-mono text-[11px] text-slate-500">Tx: {item.transaction_hash}</p>}</article>)}</div>}
    </div>}
    <p className="flex items-center gap-2 text-xs text-slate-500"><Clock3 size={14}/> Smart contract menolak durasi lebih dari 24 jam; admin dapat mencabut izin darurat lebih awal.</p>
  </section>;
}