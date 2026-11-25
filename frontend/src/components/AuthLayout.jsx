import { Activity, LockKeyhole, ShieldCheck, UserRoundCheck } from "lucide-react";

const highlights = [
  { icon: ShieldCheck, title: "Privasi sebagai prioritas", text: "Data rekam medis dilindungi dengan kontrol akses." },
  { icon: LockKeyhole, title: "Akses di bawah kendali pasien", text: "Pasien menentukan dokter yang dapat melihat data." },
  { icon: UserRoundCheck, title: "Ruang kerja sesuai peran", text: "Pengalaman terpisah untuk pasien, dokter, dan admin." },
];

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="min-h-screen bg-[#eef3f2] p-3 sm:p-6 lg:grid lg:place-items-center">
      <div className="mx-auto grid min-h-[min(780px,calc(100vh-3rem))] w-full max-w-6xl overflow-hidden rounded-[28px] border border-white bg-white shadow-[0_24px_80px_-36px_rgba(15,50,48,0.35)] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-teal-950 to-teal-900 px-9 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-12 xl:py-12">
          <div className="pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-teal-300/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-teal-100"><Activity size={23}/></span>
              <div><p className="text-lg font-bold tracking-tight">MediChain</p><p className="text-xs text-teal-100/70">Healthcare workspace</p></div>
            </div>
            <div className="mt-20 max-w-md">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-200">Perawatan yang terhubung</p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[44px]">Informasi kesehatan, lebih teratur dan terkendali.</h1>
              <p className="mt-5 text-sm leading-6 text-slate-200/75">Satu ruang kerja untuk mengelola rekam medis, konsultasi, dan akses pasien.</p>
            </div>
            <div className="mt-10 space-y-3">
              {highlights.map(({icon: Icon,title,text})=><div key={title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-3.5"><span className="mt-0.5 text-teal-200"><Icon size={18}/></span><div><p className="text-sm font-semibold">{title}</p><p className="mt-0.5 text-xs leading-5 text-slate-200/65">{text}</p></div></div>)}
            </div>
          </div>
          <p className="relative mt-10 text-xs text-slate-300/55">MediChain · Medical Record System</p>
        </aside>

        <section className="flex items-center justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-800 text-white"><Activity size={21}/></span><div><p className="font-bold text-slate-900">MediChain</p><p className="text-[11px] text-slate-500">Healthcare workspace</p></div></div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-700">{eyebrow}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
            <div className="mt-8">{children}</div>
            <div className="mt-8 border-t border-slate-100 pt-5">{footer}</div>
            <p className="mt-5 text-center text-[11px] text-slate-400">Dengan melanjutkan, gunakan wallet dan akun milik Anda sendiri.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
