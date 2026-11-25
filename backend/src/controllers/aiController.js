const db = require("../config/database");
const { medicalRecordContract, ensureMedicalRecordFilesTable } = require("../services/blockchainService");
const { ensureTables } = require("./healthFeatureController");
const { logAuditEvent } = require("../services/auditService");

async function ensureAiTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS medical_document_extractions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_wallet VARCHAR(42) NOT NULL, transaction_hash CHAR(66) NOT NULL UNIQUE,
    results JSON NOT NULL, reviewed_by BIGINT UNSIGNED NOT NULL,
    reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_extraction_patient (patient_wallet)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS ai_conversations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
    patient_id BIGINT UNSIGNED NOT NULL, role ENUM('user','assistant') NOT NULL,
    message TEXT NOT NULL, sources JSON NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_chat_user (user_id, patient_id, id)
  )`);
}

async function patientWallet(patientId) {
  const [rows] = await db.query("SELECT id,wallet_address,full_name FROM users WHERE id=? AND role='patient'", [patientId]);
  return rows[0] || null;
}

async function doctorCanAccess(doctorId, patientId) {
  const [rows] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [doctorId]);
  const patient = await patientWallet(patientId);
  if (!rows[0]?.wallet_address || !patient?.wallet_address) return false;
  const d = await medicalRecordContract.doctors(rows[0].wallet_address);
  return Boolean(d.registered && d.verified && await medicalRecordContract.accessPermissions(patient.wallet_address, rows[0].wallet_address));
}

async function scanDocument(req, res) {
  try {
    const patientId = Number(req.query.patientId);
    if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ message: "Pilih pasien yang valid." });
    if (!(await doctorCanAccess(req.user.id, patientId))) return res.status(403).json({ message: "Izin blockchain aktif diperlukan untuk memindai dokumen pasien." });
    if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ message: "File dokumen kosong." });
    if (!process.env.AI_SERVICE_TOKEN) return res.status(503).json({ message: "AI_SERVICE_TOKEN belum dikonfigurasi pada backend." });
    let filename = String(req.get("x-filename") || "medical-document").replace(/[\r\n]/g, "").slice(0, 180);
    try { filename = decodeURIComponent(filename); } catch { /* retain the safe encoded name */ }
    const base = (process.env.AI_SERVICE_URL || "http://127.0.0.1:8001").replace(/\/$/, "");
    const patient = await patientWallet(patientId);
    const [doctor] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]);
    await logAuditEvent({ actorUserId:req.user.id, actorWallet:doctor[0]?.wallet_address, doctorUserId:req.user.id, doctorWallet:doctor[0]?.wallet_address, patientUserId:patientId, patientWallet:patient.wallet_address, eventType:"medical_document_ocr_scanned", description:"Dokter menjalankan OCR lokal pada dokumen medis pasien" });
    const upstream = await fetch(`${base}/scan`, { method: "POST", headers: { "Content-Type": "application/octet-stream", "X-Filename": filename, "X-AI-Service-Token": process.env.AI_SERVICE_TOKEN }, body: req.body, signal: AbortSignal.timeout(120000) });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json({ message: body.detail || "Pemindaian OCR gagal." });
    return res.json(body);
  } catch (e) {
    console.error("AI scan:", e.message);
    return res.status(e.name === "TimeoutError" ? 504 : 503).json({ message: "Layanan OCR tidak tersedia. Pastikan AI service berjalan." });
  }
}

async function saveReviewedExtraction(req, res) {
  const patientId = Number(req.body.patientId);
  const tx = String(req.body.transactionHash || "");
  const results = req.body.results;
  if (!Number.isSafeInteger(patientId) || patientId < 1 || !/^0x[a-fA-F0-9]{64}$/.test(tx) || !Array.isArray(results) || results.length > 100) return res.status(400).json({ message: "Data hasil tinjauan tidak valid." });
  const clean = [];
  for (const row of results) {
    const item = {};
    for (const [field, max] of [["testName",120],["resultValue",180],["unit",32],["referenceRange",64]]) {
      if (typeof row?.[field] !== "string" || row[field].length > max) return res.status(400).json({ message: "Kolom hasil pemeriksaan tidak valid." });
      item[field] = row[field].trim();
    }
    if (!item.testName || !item.resultValue) return res.status(400).json({ message: "Nama pemeriksaan dan hasil wajib diisi." });
    clean.push(item);
  }
  try {
    await ensureMedicalRecordFilesTable(); await ensureAiTables();
    if (!(await doctorCanAccess(req.user.id, patientId))) return res.status(403).json({ message: "Izin blockchain aktif diperlukan." });
    const patient = await patientWallet(patientId);
    const [records] = await db.query("SELECT transaction_hash FROM medical_record_files WHERE transaction_hash=? AND patient_wallet=?", [tx, patient.wallet_address]);
    if (!records.length) return res.status(404).json({ message: "Rekam medis tidak ditemukan untuk pasien ini." });
    await db.query(`INSERT INTO medical_document_extractions(patient_wallet,transaction_hash,results,reviewed_by) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE results=VALUES(results),reviewed_by=VALUES(reviewed_by),reviewed_at=CURRENT_TIMESTAMP`, [patient.wallet_address, tx, JSON.stringify(clean), req.user.id]);
    const [doctor] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]);
    await logAuditEvent({ actorUserId:req.user.id, actorWallet:doctor[0]?.wallet_address, doctorUserId:req.user.id, doctorWallet:doctor[0]?.wallet_address, patientUserId:patientId, patientWallet:patient.wallet_address, eventType:"medical_document_ocr_reviewed", description:"Dokter menyimpan hasil OCR setelah meninjau data", transactionHash:tx });
    return res.status(201).json({ message: "Hasil OCR yang telah ditinjau dokter tersimpan.", transactionHash: tx });
  } catch (e) { console.error("Save reviewed extraction:", e.message); return res.status(500).json({ message: "Gagal menyimpan hasil tinjauan." }); }
}

async function doctorSummary(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ message: "Pasien tidak valid." });
  try {
    if (!(await doctorCanAccess(req.user.id, patientId))) return res.status(403).json({ message: "Izin blockchain aktif diperlukan." });
    await ensureTables(); await ensureMedicalRecordFilesTable(); await ensureAiTables();
    const patient = await patientWallet(patientId);
    const from = req.query.fromDate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fromDate) ? `${req.query.fromDate} 00:00:00` : "1970-01-01 00:00:00";
    const to = req.query.toDate && /^\d{4}-\d{2}-\d{2}$/.test(req.query.toDate) ? `${req.query.toDate} 23:59:59` : "9999-12-31 23:59:59";
    const [records] = await db.query(`SELECT m.transaction_hash,m.commitment,m.category,m.description,m.created_at,m.doctor_wallet,u.full_name AS doctor_name,e.results AS extracted_results FROM medical_record_files m LEFT JOIN users u ON LOWER(u.wallet_address)=LOWER(m.doctor_wallet) LEFT JOIN medical_document_extractions e ON e.transaction_hash=m.transaction_hash WHERE LOWER(m.patient_wallet)=LOWER(?) AND m.created_at BETWEEN ? AND ? ORDER BY m.created_at DESC`, [patient.wallet_address, from, to]);
    const [prescriptions] = await db.query("SELECT p.medicine_name,p.dosage,p.frequency,p.duration,p.issued_at,u.full_name AS doctor_name FROM prescriptions p JOIN users u ON u.id=p.doctor_id WHERE p.patient_id=? ORDER BY p.issued_at DESC LIMIT 100", [patientId]);
    const [[profiles]] = await db.query("SELECT blood_type,allergies,chronic_diseases,current_medications,updated_at FROM health_profiles WHERE patient_id=?", [patientId]);
    const timeline = [];
    for (const r of records) {
      if (await medicalRecordContract.revokedCommitments(patient.wallet_address, r.commitment)) continue;
      timeline.push({ transactionHash:r.transaction_hash, date:r.created_at, category:r.category, description:r.description || "Rekam medis", doctorName:r.doctor_name || "Dokter", extractedResults:typeof r.extracted_results === "string" ? JSON.parse(r.extracted_results) : (r.extracted_results || []) });
    }
    const [doctor] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]);
    await logAuditEvent({ actorUserId:req.user.id, actorWallet:doctor[0]?.wallet_address, doctorUserId:req.user.id, doctorWallet:doctor[0]?.wallet_address, patientUserId:patientId, patientWallet:patient.wallet_address, eventType:"patient_summary_viewed", description:"Dokter membuka ringkasan AI terstruktur pasien" });
    return res.json({ patientName:patient.full_name, period:{fromDate:req.query.fromDate || null,toDate:req.query.toDate || null}, counts:{records:timeline.length,laboratory:timeline.filter(x=>x.category==="Laboratory Result").length,consultations:timeline.filter(x=>x.category==="Consultation").length,diagnoses:timeline.filter(x=>x.category==="Diagnosis").length}, timeline, diagnoses:timeline.filter(x=>x.category==="Diagnosis"), prescriptions, bloodType:profiles?.blood_type || "", allergies:profiles?.allergies || "", chronicDiseases:profiles?.chronic_diseases || "", currentMedications:profiles?.current_medications || "", sources:timeline.map(({transactionHash,date,category,description})=>({transactionHash,date,category,description})) });
  } catch(e) { console.error("AI summary:",e.message); return res.status(500).json({message:"Gagal menyusun ringkasan pasien."}); }
}

const termInfo = {
  hemoglobin:"Hemoglobin adalah protein dalam sel darah merah yang membawa oksigen. Makna hasil bergantung pada rentang rujukan laboratorium dan kondisi pasien.",
  hematokrit:"Hematokrit menunjukkan proporsi volume darah yang terdiri dari sel darah merah. Maknanya perlu dinilai dokter bersama hasil lain dan rentang rujukan.",
  eritrosit:"Eritrosit adalah sel darah merah yang membawa oksigen. Hasilnya perlu dibaca bersama hemoglobin, hematokrit, dan konteks pasien.",
  leukosit:"Leukosit adalah sel darah putih yang berperan dalam sistem kekebalan. Nilai perlu dibaca bersama rentang rujukan dan konteks klinis.",
  platelet:"Trombosit (platelet) membantu proses pembekuan darah. Rentang rujukan dapat berbeda antar laboratorium.",
  mcv:"MCV menggambarkan ukuran rata-rata sel darah merah. Dokter menilainya bersama indeks darah lain dan kondisi pasien.",
  mch:"MCH menggambarkan rata-rata jumlah hemoglobin dalam satu sel darah merah. Nilainya tidak cukup untuk menetapkan diagnosis sendiri.",
  mchc:"MCHC menggambarkan konsentrasi hemoglobin rata-rata dalam sel darah merah. Interpretasi perlu mempertimbangkan hasil darah lainnya.",
  rdw:"RDW menggambarkan variasi ukuran sel darah merah. Nilai ini perlu ditafsirkan bersama parameter darah lain oleh tenaga medis.",
  ferritin:"Ferritin adalah protein penyimpan zat besi dan dapat diperiksa sebagai salah satu gambaran cadangan zat besi. Hasil perlu dinilai dokter dengan konteks klinis.",
  glukosa:"Glukosa adalah kadar gula dalam darah. Interpretasinya bergantung antara lain pada waktu pengambilan dan apakah pasien berpuasa.",
  hba1c:"HbA1c menggambarkan rata-rata kadar gula darah dalam periode beberapa bulan. Penilaian hasil dan tindak lanjut harus dilakukan dokter.",
  kreatinin:"Kreatinin adalah zat sisa yang sering digunakan dokter sebagai salah satu indikator fungsi ginjal; penilaian memerlukan konteks klinis.",
  kolesterol:"Kolesterol adalah salah satu jenis lemak dalam darah. Dokter dapat menilai kolesterol total bersama LDL, HDL, trigliserida, dan faktor kesehatan lain.",
  ldl:"LDL adalah salah satu jenis lipoprotein pembawa kolesterol. Penilaian hasil bergantung pada profil kesehatan dan keputusan klinis dokter.",
  hdl:"HDL adalah salah satu jenis lipoprotein pembawa kolesterol. Nilainya dinilai bersama profil lipid dan faktor kesehatan lain.",
  trigliserida:"Trigliserida adalah jenis lemak dalam darah. Hasil dapat dipengaruhi kondisi pengambilan sampel dan perlu dinilai bersama profil lipid lain."
};

function localAnswer(question, rows) {
  const q = question.toLowerCase();
  const aliases = {hemoglobin:["hb","hemoglobin"],hematokrit:["hematokrit","hematocrit","hct"],eritrosit:["eritrosit","erythrocyte","rbc"],leukosit:["leukosit","leukocyte","wbc"],platelet:["platelet","trombosit","plt"],mcv:["mcv"],mch:["mch"],mchc:["mchc"],rdw:["rdw"],ferritin:["ferritin"],glukosa:["glukosa","glucose","gula darah"],hba1c:["hba1c","a1c"],kreatinin:["kreatinin","creatinine"],kolesterol:["kolesterol","cholesterol"],ldl:["ldl"],hdl:["hdl"],trigliserida:["trigliserida","triglyceride"]};
  const term = Object.keys(termInfo).find(k => (aliases[k] || [k]).some(alias => q.includes(alias)));
  const matching = rows.filter(r => `${r.description || ""} ${r.category || ""} ${(r.results || []).map(x=>`${x.testName} ${x.resultValue}`).join(" ")}`.toLowerCase().split(/\W+/).some(w=>w.length>2 && q.includes(w)));
  const relevant = matching.length ? matching : (/(hasil|lab|pemeriksaan|terbaru|record|rekam medis)/i.test(question) ? rows.slice(0,3) : []);
  let answer = term ? termInfo[term] : "Saya dapat membantu menjelaskan istilah umum atau menunjukkan bagian rekam medis yang relevan. Saya tidak memberikan diagnosis, rekomendasi pengobatan, atau penentuan dosis.";
  const extracted = relevant.flatMap(r => (r.results || []).filter(x => !term || (aliases[term] || [term]).some(alias => `${x.testName} ${x.resultValue}`.toLowerCase().includes(alias))).map(x => `${x.testName}: ${x.resultValue}${x.unit ? ` ${x.unit}` : ""}${x.referenceRange ? ` (rujukan: ${x.referenceRange})` : ""}`));
  if (extracted.length) answer += "\n\nData yang tercatat: " + extracted.slice(0,8).join("; ") + ". Angka dan rentang ini ditampilkan apa adanya dari record, bukan interpretasi medis.";
  if (relevant.length) answer += "\n\nSumber MediChain: " + relevant.slice(0,3).map(r=>`${r.category || "Rekam medis"} (${r.transaction_hash})`).join("; ") + ". Silakan diskusikan interpretasinya dengan dokter.";
  return { answer, sources:relevant.slice(0,3).map(r=>({transactionHash:r.transaction_hash,category:r.category,description:r.description,createdAt:r.created_at})) };
}

async function listConversations(req,res) {
  try { await ensureAiTables(); const [rows]=await db.query("SELECT id,role,message,sources,created_at FROM ai_conversations WHERE user_id=? AND patient_id=? ORDER BY id DESC LIMIT 100",[req.user.id,req.user.id]); return res.json({messages:rows.reverse().map(r=>({...r,sources:typeof r.sources==="string"?JSON.parse(r.sources):r.sources}))}); }
  catch(e){ return res.status(500).json({message:"Gagal memuat percakapan."}); }
}

async function clearConversations(req,res) {
  try {
    await ensureAiTables();
    await db.query("DELETE FROM ai_conversations WHERE user_id=? AND patient_id=?", [req.user.id, req.user.id]);
    return res.json({message:"Riwayat percakapan AI berhasil dihapus."});
  } catch(e) {
    console.error("Clear AI conversations:",e.message);
    return res.status(500).json({message:"Gagal menghapus riwayat percakapan."});
  }
}

async function askAssistant(req,res) {
  const question=typeof req.body.message==="string"?req.body.message.trim():"";
  if(!question||question.length>1200)return res.status(400).json({message:"Pertanyaan wajib diisi (maksimal 1.200 karakter)."});
  try {
    await ensureAiTables(); await ensureMedicalRecordFilesTable();
    const patient=await patientWallet(req.user.id);
    const [records]=patient?.wallet_address?await db.query("SELECT m.transaction_hash,m.commitment,m.category,m.description,m.created_at,e.results FROM medical_record_files m LEFT JOIN medical_document_extractions e ON e.transaction_hash=m.transaction_hash WHERE LOWER(m.patient_wallet)=LOWER(?) ORDER BY m.created_at DESC LIMIT 100",[patient.wallet_address]):[[]];
    const rows=[];
    for(const r of records){if(await medicalRecordContract.revokedCommitments(patient.wallet_address,r.commitment))continue;rows.push({...r,results:typeof r.results==="string"?JSON.parse(r.results):(r.results||[])});}
    if(patient?.wallet_address) await logAuditEvent({actorUserId:req.user.id,actorWallet:patient.wallet_address,patientUserId:req.user.id,patientWallet:patient.wallet_address,eventType:"patient_ai_assistant_used",description:"Pasien menggunakan asisten kesehatan untuk mencari penjelasan dan sumber rekam medis"});
    const {answer,sources}=localAnswer(question,rows);
    await db.query("INSERT INTO ai_conversations(user_id,patient_id,role,message) VALUES(?,?,'user',?)",[req.user.id,req.user.id,question]);
    await db.query("INSERT INTO ai_conversations(user_id,patient_id,role,message,sources) VALUES(?,?,'assistant',?,?)",[req.user.id,req.user.id,answer,JSON.stringify(sources)]);
    return res.json({answer,sources,disclaimer:"Informasi edukasi, bukan diagnosis atau pengganti konsultasi dokter."});
  } catch(e){console.error("AI assistant:",e.message);return res.status(500).json({message:"Asisten gagal memproses pertanyaan."});}
}

module.exports={ensureAiTables,scanDocument,saveReviewedExtraction,doctorSummary,listConversations,clearConversations,askAssistant};
