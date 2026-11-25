import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, LockKeyhole, CircleCheck } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import api from "../services/api";

const inputClass="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Password dan konfirmasi password belum sama.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Password belum dapat diperbarui. Minta tautan baru.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout eyebrow="Keamanan akun" title={complete?"Password diperbarui":"Buat password baru"} description={complete?"Password akun MediChain Anda sudah berhasil diganti.":"Gunakan password baru minimal 8 karakter. Tautan reset hanya dapat digunakan satu kali."} footer={<p className="text-center text-sm"><Link to="/login" className="inline-flex items-center gap-2 font-semibold text-teal-800 hover:text-teal-950"><ArrowLeft size={15}/> Kembali ke login</Link></p>}>
      {complete ? <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><div className="flex gap-3"><CircleCheck size={20} className="mt-0.5 text-teal-700"/><p className="text-sm leading-6 text-teal-950">Password berhasil diperbarui. Silakan masuk menggunakan password baru.</p></div><Link to="/login" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white hover:bg-teal-900">Masuk ke MediChain <ArrowRight size={16}/></Link></div> : !token ? <div role="alert" className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm leading-6 text-rose-800">Token reset tidak ditemukan di tautan. Kembali ke halaman lupa password untuk meminta tautan baru.</div> : <form onSubmit={handleSubmit} className="space-y-5">
        <label className="block text-sm font-semibold text-slate-700">Password baru
          <span className="relative mt-2 block"><LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={(event)=>setPassword(event.target.value)} className={inputClass} placeholder="Minimal 8 karakter"/></span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Konfirmasi password
          <span className="relative mt-2 block"><LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmPassword} onChange={(event)=>setConfirmPassword(event.target.value)} className={inputClass} placeholder="Ulangi password baru"/></span>
        </label>
        {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60">{loading?"Menyimpan...":<>Simpan password baru <ArrowRight size={16}/></>}</button>
      </form>}
    </AuthLayout>
  );
}
