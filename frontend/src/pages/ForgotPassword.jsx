import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Mail, Send, CircleCheck } from "lucide-react";
import AuthLayout from "../components/AuthLayout";
import api from "../services/api";

const inputClass="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/auth/forgot-password", { email: email.trim() });
      setMessage(response.data?.message || "Jika email terdaftar, tautan reset akan dikirim.");
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Permintaan belum dapat diproses. Coba lagi nanti.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout eyebrow="Pemulihan akun" title="Lupa password?" description="Masukkan email akun MediChain. Jika terdaftar, kami akan mengirim tautan untuk membuat password baru." footer={<p className="text-center text-sm"><Link to="/login" className="inline-flex items-center gap-2 font-semibold text-teal-800 hover:text-teal-950"><ArrowLeft size={15}/> Kembali ke login</Link></p>}>
      <form onSubmit={handleSubmit} className="space-y-5">
        {message ? <div role="status" className="rounded-2xl border border-teal-100 bg-teal-50 p-4"><div className="flex gap-3"><CircleCheck size={19} className="mt-0.5 shrink-0 text-teal-700"/><p className="text-sm leading-6 text-teal-950">{message}</p></div><p className="mt-3 text-xs leading-5 text-teal-900/70">Periksa inbox dan folder spam. Tautan hanya berlaku 15 menit dan bisa digunakan satu kali.</p></div> : <>
          <label className="block text-sm font-semibold text-slate-700">Email akun
            <span className="relative mt-2 block"><Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="email" autoComplete="email" required value={email} onChange={(event)=>setEmail(event.target.value)} className={inputClass} placeholder="nama@email.com"/></span>
          </label>
          {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
          <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60">{loading?"Mengirim...":<>Kirim tautan reset <Send size={16}/></>}</button>
        </>}
        {message&&<Link to="/login" className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white hover:bg-teal-900">Kembali ke login <ArrowRight size={16}/></Link>}
      </form>
    </AuthLayout>
  );
}
