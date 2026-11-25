
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, HeartPulse, Mail, Stethoscope, UserRound, LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const inputClass="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "patient" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(form);
      navigate("/login", { state: { registered: true } });
    } catch (err) {
      setError(err.response?.data?.message || "Registrasi gagal. Periksa kembali data Anda.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout eyebrow="Mulai menggunakan MediChain" title="Buat akun baru" description="Daftar untuk mengakses ruang kerja kesehatan sesuai peran Anda." footer={<p className="text-center text-sm text-slate-600">Sudah memiliki akun? <Link to="/login" className="ml-1 inline-flex items-center gap-1 font-semibold text-teal-800 hover:text-teal-950">Masuk <ArrowRight size={14}/></Link></p>}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">Nama lengkap
          <span className="relative mt-2 block"><UserRound size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="text" autoComplete="name" required maxLength={120} value={form.full_name} onChange={(event)=>setForm({...form,full_name:event.target.value})} className={inputClass} placeholder="Nama sesuai identitas"/></span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Email
          <span className="relative mt-2 block"><Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="email" autoComplete="email" required value={form.email} onChange={(event)=>setForm({...form,email:event.target.value})} className={inputClass} placeholder="nama@email.com"/></span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Password
          <span className="relative mt-2 block"><LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type={showPassword?"text":"password"} autoComplete="new-password" required minLength={8} value={form.password} onChange={(event)=>setForm({...form,password:event.target.value})} className={`${inputClass} pr-12`} placeholder="Minimal 8 karakter"/><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword?"Sembunyikan password":"Tampilkan password"}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>
          <span className="mt-1.5 block text-xs font-normal text-slate-400">Gunakan password minimal 8 karakter.</span>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">Daftar sebagai</legend>
          <div className="grid grid-cols-2 gap-3">
            {[{id:"patient",label:"Pasien",detail:"Kelola data kesehatan",icon:HeartPulse},{id:"doctor",label:"Dokter",detail:"Layanan medis",icon:Stethoscope}].map(({id,label,detail,icon:Icon})=>{
              const selected=form.role===id;
              return <button key={id} type="button" aria-pressed={selected} onClick={()=>setForm({...form,role:id})} className={`rounded-xl border p-3.5 text-left transition ${selected?"border-teal-700 bg-teal-50 ring-2 ring-teal-700/10":"border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}><span className={`inline-flex rounded-lg p-2 ${selected?"bg-teal-700 text-white":"bg-slate-100 text-slate-500"}`}><Icon size={17}/></span><span className="mt-2 block text-sm font-semibold text-slate-800">{label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{detail}</span></button>;
            })}
          </div>
          {form.role==="doctor"&&<p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">Akun dokter perlu registrasi wallet dan verifikasi admin sebelum dapat mengakses fitur klinis.</p>}
        </fieldset>
        {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60">{loading?"Membuat akun...":<>Buat akun <ArrowRight size={16}/></>}</button>
      </form>
    </AuthLayout>
  );
}
