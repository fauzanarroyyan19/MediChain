import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, LockKeyhole, Mail, ArrowRight, CircleCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import AuthLayout from "../components/AuthLayout";

const inputClass="w-full rounded-xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await login(form.email.trim(), form.password);
      navigate(`/${user.role}/dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || "Login gagal. Periksa kembali email dan password Anda.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Selamat datang kembali"
      title="Masuk ke akun Anda"
      description="Masuk untuk melanjutkan ke ruang kerja kesehatan MediChain."
      footer={<p className="text-center text-sm text-slate-600">Belum memiliki akun? <Link to="/register" className="ml-1 inline-flex items-center gap-1 font-semibold text-teal-800 hover:text-teal-950">Buat akun <ArrowRight size={14}/></Link></p>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {location.state?.registered && <div className="flex gap-2.5 rounded-xl border border-teal-100 bg-teal-50 p-3.5 text-sm text-teal-900"><CircleCheck size={18} className="mt-0.5 shrink-0 text-teal-700"/><p>Akun berhasil dibuat. Silakan masuk dengan email dan password Anda.</p></div>}
        <label className="block text-sm font-semibold text-slate-700">Email
          <span className="relative mt-2 block"><Mail size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type="email" autoComplete="email" required value={form.email} onChange={(event)=>setForm({...form,email:event.target.value})} className={inputClass} placeholder="nama@email.com"/></span>
        </label>
        <label className="block text-sm font-semibold text-slate-700">Password
          <span className="relative mt-2 block"><LockKeyhole size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"/><input type={showPassword?"text":"password"} autoComplete="current-password" required value={form.password} onChange={(event)=>setForm({...form,password:event.target.value})} className={`${inputClass} pr-12`} placeholder="Masukkan password"/><button type="button" onClick={()=>setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={showPassword?"Sembunyikan password":"Tampilkan password"}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button></span>
        </label>
        <div className="-mt-2 text-right"><Link to="/forgot-password" className="text-xs font-semibold text-teal-800 hover:text-teal-950">Lupa password?</Link></div>
        {error&&<div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-teal-800 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-900 focus:outline-none focus:ring-4 focus:ring-teal-700/20 disabled:cursor-not-allowed disabled:opacity-60">
          {loading?"Sedang masuk...":<>Masuk ke MediChain <ArrowRight size={16}/></>}
        </button>
        <p className="text-center text-xs leading-5 text-slate-400">Akses dashboard mengikuti role yang terdaftar pada akun Anda.</p>
      </form>
    </AuthLayout>
  );
}
