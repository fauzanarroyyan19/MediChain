const crypto = require("crypto");
const db = require("../config/database");
const { medicalRecordContract } = require("../services/blockchainService");
const { logAuditEvent } = require("../services/auditService");

async function ensureTables() {
  await db.query(`CREATE TABLE IF NOT EXISTS health_profiles (
    patient_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, blood_type VARCHAR(8) NULL,
    allergies TEXT NULL, medical_history TEXT NULL, chronic_diseases TEXT NULL,
    current_medications TEXT NULL, emergency_contact VARCHAR(255) NULL, notes TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS prescriptions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL, medicine_name VARCHAR(255) NOT NULL, dosage VARCHAR(255) NOT NULL,
    frequency VARCHAR(255) NOT NULL, duration VARCHAR(255) NOT NULL, instructions TEXT NULL, notes TEXT NULL,
    issued_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_prescription_patient (patient_id, issued_at), INDEX idx_prescription_doctor (doctor_id)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS qr_access_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, patient_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE, doctor_id BIGINT UNSIGNED NULL, expires_at DATETIME NOT NULL,
    used_at DATETIME NULL, revoked_at DATETIME NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_qr_patient (patient_id), INDEX idx_qr_expiry (expires_at)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS access_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL, token_id BIGINT UNSIGNED NOT NULL, status ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP NULL,
    UNIQUE KEY unique_pending_token (token_id), INDEX idx_access_patient (patient_id, status)
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, user_id BIGINT UNSIGNED NOT NULL,
    type VARCHAR(60) NOT NULL, title VARCHAR(255) NOT NULL, message VARCHAR(1000) NOT NULL,
    related_id BIGINT UNSIGNED NULL, read_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_user (user_id, created_at), INDEX idx_notification_unread (user_id, read_at)
  )`);
}

async function notify(userId, type, title, message, relatedId = null) {
  try {
    await ensureTables();
    await db.query("INSERT INTO notifications (user_id,type,title,message,related_id) VALUES (?,?,?,?,?)", [userId,type,title,message,relatedId]);
  } catch (error) {
    console.error("Notification insert error:", error.message);
  }
}
async function notifyAdmins(type, title, message, relatedId = null) {
  try {
    const [admins] = await db.query("SELECT id FROM users WHERE role='admin'");
    await Promise.all(admins.map((admin) => notify(admin.id, type, title, message, relatedId)));
  } catch (error) {
    console.error("Admin notification fanout error:", error.message);
  }
}
async function activePermission(patientId, doctorId) {
  const [[p], [d]] = await Promise.all([
    db.query("SELECT wallet_address FROM users WHERE id=? AND role='patient'", [patientId]),
    db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [doctorId]),
  ]);
  if (!p.length || !d.length || !p[0].wallet_address || !d[0].wallet_address) return false;
  const status=await medicalRecordContract.doctors(d[0].wallet_address);
  return Boolean(status.registered && status.verified && await medicalRecordContract.accessPermissions(p[0].wallet_address, d[0].wallet_address));
}

async function getHealthProfile(req,res) {
  try {
    if(!["patient","doctor"].includes(req.user.role))return res.status(403).json({message:"Profil kesehatan hanya dapat diakses pasien atau dokter yang diberi izin."});
    await ensureTables();
    const patientId = req.user.role === "patient" ? req.user.id : Number(req.query.patientId);
    if (!Number.isSafeInteger(Number(patientId)) || patientId < 1) return res.status(400).json({message:"Pasien tidak valid."});
    if (req.user.role === "doctor" && !(await activePermission(patientId,req.user.id))) return res.status(403).json({message:"Izin blockchain aktif diperlukan untuk melihat profil kesehatan."});
    const [rows] = await db.query("SELECT * FROM health_profiles WHERE patient_id=?",[patientId]);
    if (req.user.role === "doctor") {
      const [[patient]] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='patient'", [patientId]);
      const [[doctor]] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]);
      const emergencyExpiry = await medicalRecordContract.emergencyAccessExpiry(patient.wallet_address, doctor.wallet_address);
      const regularAccess = await medicalRecordContract.regularAccessPermissions(patient.wallet_address, doctor.wallet_address);
      if (!regularAccess && emergencyExpiry > BigInt(Math.floor(Date.now() / 1000))) await notify(patientId, "emergency_access_used", "Akses darurat digunakan", "Dokter membuka profil kesehatan menggunakan emergency access.");
      await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctor?.wallet_address, doctorUserId: req.user.id, doctorWallet: doctor?.wallet_address, patientUserId: patientId, patientWallet: patient?.wallet_address, eventType: !regularAccess && emergencyExpiry > BigInt(Math.floor(Date.now() / 1000)) ? "emergency_access_used" : "patient_data_accessed", description: "Dokter membuka profil kesehatan pasien" });
    }
    return res.json({profile:rows[0] || {patient_id:patientId,blood_type:"",allergies:"",medical_history:"",chronic_diseases:"",current_medications:"",emergency_contact:"",notes:"",updated_at:null}});
  } catch(e) { console.error("Health profile:",e.message); return res.status(500).json({message:"Gagal memuat profil kesehatan."}); }
}
async function saveHealthProfile(req,res) {
  const fields=["blood_type","allergies","medical_history","chronic_diseases","current_medications","emergency_contact","notes"];
  const data={};
  for(const key of fields){const value=req.body[key] ?? ""; if(typeof value!=="string" || value.length>5000)return res.status(400).json({message:`Nilai ${key} tidak valid.`}); data[key]=value.trim();}
  if(data.blood_type && !/^(A|B|AB|O)[+-]$/.test(data.blood_type))return res.status(400).json({message:"Golongan darah harus A+, A-, B+, B-, AB+, AB-, O+, atau O-."});
  try { await ensureTables(); await db.query(`INSERT INTO health_profiles (patient_id,${fields.join(",")}) VALUES (?,${fields.map(()=>"?").join(",")}) ON DUPLICATE KEY UPDATE ${fields.map(f=>`${f}=VALUES(${f})`).join(",")}`,[req.user.id,...fields.map(f=>data[f])]); await notify(req.user.id,"health_profile_updated","Profil kesehatan diperbarui","Profil kesehatan Anda berhasil diperbarui."); return res.json({message:"Profil kesehatan tersimpan."}); }
  catch(e){console.error("Save health profile:",e.message);return res.status(500).json({message:"Gagal menyimpan profil kesehatan."});}
}
async function createPrescription(req,res) {
  const patientId=Number(req.body.patientId); const keys=["medicineName","dosage","frequency","duration"];
  if(!Number.isSafeInteger(patientId)||patientId<1||keys.some(k=>typeof req.body[k]!=="string"||!req.body[k].trim()||req.body[k].length>255))return res.status(400).json({message:"Pasien, obat, dosis, frekuensi, dan durasi wajib diisi dengan benar."});
  const instructions=typeof req.body.instructions==="string"?req.body.instructions.trim():""; const notes=typeof req.body.notes==="string"?req.body.notes.trim():"";
  if(instructions.length>5000||notes.length>5000)return res.status(400).json({message:"Instruksi atau catatan terlalu panjang."});
  try { await ensureTables(); const [[patients],[doctors]]=await Promise.all([db.query("SELECT id FROM users WHERE id=? AND role='patient'",[patientId]),db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'",[req.user.id])]); if(!patients.length)return res.status(404).json({message:"Pasien tidak ditemukan."}); if(!(await activePermission(patientId,req.user.id)))return res.status(403).json({message:"Izin blockchain aktif diperlukan untuk membuat resep."}); const [r]=await db.query("INSERT INTO prescriptions(patient_id,doctor_id,medicine_name,dosage,frequency,duration,instructions,notes) VALUES(?,?,?,?,?,?,?,?)",[patientId,req.user.id,...keys.map(k=>req.body[k].trim()),instructions,notes]); await notify(patientId,"prescription_created","Resep digital baru","Dokter Anda menerbitkan resep baru.",r.insertId); return res.status(201).json({id:r.insertId,message:"Resep tersimpan."}); }
  catch(e){console.error("Create prescription:",e.message);return res.status(500).json({message:"Gagal menyimpan resep."});}
}
async function listPrescriptions(req,res) {
  try { await ensureTables(); const patientId=req.user.role==="patient"?req.user.id:Number(req.query.patientId); if(req.user.role==="doctor"&&(!Number.isSafeInteger(patientId)||!(await activePermission(patientId,req.user.id))))return res.status(403).json({message:"Izin blockchain aktif diperlukan."}); const [rows]=await db.query(`SELECT p.*,d.full_name AS doctor_name,pt.full_name AS patient_name FROM prescriptions p JOIN users d ON d.id=p.doctor_id JOIN users pt ON pt.id=p.patient_id WHERE p.${req.user.role==="patient"?"patient_id":"patient_id"}=? ${req.user.role==="doctor"?"AND p.doctor_id=?":""} ORDER BY p.issued_at DESC`,req.user.role==="patient"?[patientId]:[patientId,req.user.id]); return res.json({prescriptions:rows}); }
  catch(e){console.error("List prescriptions:",e.message);return res.status(500).json({message:"Gagal memuat resep."});}
}
async function createQrToken(req,res) {
  const hours=Number(req.body.durationHours); const doctorId=req.body.doctorId?Number(req.body.doctorId):null;
  if(!Number.isInteger(hours)||hours<1||hours>168|| (doctorId!==null&&(!Number.isSafeInteger(doctorId)||doctorId<1)))return res.status(400).json({message:"Durasi 1–168 jam dan dokter opsional harus valid."});
  try { await ensureTables(); if(doctorId){const [[d]]=await db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='doctor'",[doctorId]);if(!d.length)return res.status(404).json({message:"Dokter tidak ditemukan."});if(!d[0].wallet_address)return res.status(409).json({message:"Dokter belum menghubungkan wallet."});const status=await medicalRecordContract.doctors(d[0].wallet_address);if(!status.registered||!status.verified)return res.status(409).json({message:"QR hanya dapat dibatasi ke dokter terverifikasi."});} const token=crypto.randomBytes(32).toString("base64url"); const hash=crypto.createHash("sha256").update(token).digest("hex"); const expires=new Date(Date.now()+hours*3600000); const sqlDate=expires.toISOString().slice(0,19).replace("T"," "); await db.query("INSERT INTO qr_access_tokens(patient_id,token_hash,doctor_id,expires_at) VALUES(?,?,?,?)",[req.user.id,hash,doctorId,sqlDate]); await notify(req.user.id,"qr_share_created","QR akses dibuat",`QR akses berlaku sampai ${expires.toLocaleString("id-ID")}.`); return res.status(201).json({token,expiresAt:expires.toISOString()}); }
  catch(e){console.error("Create QR token:",e.message);return res.status(500).json({message:"Gagal membuat QR akses."});}
}
async function claimQrToken(req,res) {
  const token=typeof req.body.token==="string"?req.body.token.trim():""; if(token.length<30||token.length>100)return res.status(400).json({message:"Token QR tidak valid."});
  try {await ensureTables();const [doctorRows]=await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'",[req.user.id]);if(!doctorRows.length||!doctorRows[0].wallet_address)return res.status(403).json({message:"Akun dokter belum memiliki wallet."});const doctorStatus=await medicalRecordContract.doctors(doctorRows[0].wallet_address);if(!doctorStatus.registered||!doctorStatus.verified)return res.status(403).json({message:"Dokter harus terdaftar dan terverifikasi di blockchain."}); const hash=crypto.createHash("sha256").update(token).digest("hex"); const [rows]=await db.query("SELECT * FROM qr_access_tokens WHERE token_hash=? AND revoked_at IS NULL AND used_at IS NULL AND expires_at>UTC_TIMESTAMP()",[hash]); if(!rows.length)return res.status(404).json({message:"Token kedaluwarsa, sudah dipakai, atau dicabut."}); const share=rows[0]; if(share.doctor_id&&Number(share.doctor_id)!==Number(req.user.id))return res.status(403).json({message:"QR ini ditujukan untuk dokter lain."}); const [used]=await db.query("UPDATE qr_access_tokens SET used_at=UTC_TIMESTAMP() WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>UTC_TIMESTAMP()",[share.id]);if(!used.affectedRows)return res.status(409).json({message:"Token QR sudah digunakan."}); const [r]=await db.query("INSERT INTO access_requests(patient_id,doctor_id,token_id) VALUES(?,?,?)",[share.patient_id,req.user.id,share.id]); await notify(share.patient_id,"access_requested","Permintaan akses dokter","Dokter meminta akses melalui QR. Tinjau dan setujui dari dashboard.",r.insertId); return res.status(201).json({message:"Permintaan akses dikirim. Pasien harus menyetujui dari dashboard."});}
  catch(e){console.error("Claim QR:",e.message);return res.status(500).json({message:"Gagal memvalidasi QR."});}
}
async function listAccessRequests(req,res){try{await ensureTables();const [rows]=await db.query("SELECT ar.id,ar.status,ar.created_at,d.full_name AS doctor_name,d.id AS doctor_id,d.wallet_address AS doctor_wallet,DATE_FORMAT(q.expires_at,'%Y-%m-%dT%H:%i:%sZ') AS expires_at FROM access_requests ar JOIN users d ON d.id=ar.doctor_id JOIN qr_access_tokens q ON q.id=ar.token_id WHERE ar.patient_id=? AND ar.status='Pending' ORDER BY ar.created_at DESC",[req.user.id]);return res.json({requests:rows});}catch(e){return res.status(500).json({message:"Gagal memuat permintaan akses."});}}
async function reviewAccessRequest(req,res){const decision=req.body.decision;if(!["Approved","Rejected"].includes(decision))return res.status(400).json({message:"Keputusan tidak valid."});try{await ensureTables();const [rows]=await db.query("SELECT ar.*,DATE_FORMAT(q.expires_at,'%Y-%m-%dT%H:%i:%sZ') AS expires_at FROM access_requests ar JOIN qr_access_tokens q ON q.id=ar.token_id WHERE ar.id=? AND ar.patient_id=? AND ar.status='Pending'",[req.params.id,req.user.id]);if(!rows.length)return res.status(404).json({message:"Permintaan tidak ditemukan atau sudah ditinjau."});if(decision==="Approved"&&new Date(rows[0].expires_at)<=new Date())return res.status(409).json({message:"Masa berlaku QR sudah habis. Buat QR baru."});if(decision==="Approved"&&!(await activePermission(req.user.id,rows[0].doctor_id)))return res.status(409).json({message:"Akses blockchain belum aktif atau transaksinya belum terkonfirmasi."});await db.query("UPDATE access_requests SET status=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?",[decision,req.params.id]);await notify(rows[0].doctor_id,decision==="Approved"?"access_granted":"access_rejected",decision==="Approved"?"Akses diberikan":"Permintaan akses ditolak",decision==="Approved"?"Pasien menyetujui akses blockchain Anda.":"Pasien menolak permintaan akses.");return res.json({message:decision==="Approved"?"Persetujuan tercatat.":"Permintaan ditolak."});}catch(e){console.error("Review access:",e.message);return res.status(500).json({message:"Gagal meninjau permintaan."});}}
async function listNotifications(req,res){try{await ensureTables();const [rows]=await db.query("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100",[req.user.id]);const [[count]]=await db.query("SELECT COUNT(*) AS unread FROM notifications WHERE user_id=? AND read_at IS NULL",[req.user.id]);return res.json({notifications:rows,unread:Number(count.unread)});}catch(e){return res.status(500).json({message:"Gagal memuat notifikasi."});}}
async function markNotificationRead(req,res){try{await ensureTables();const [r]=await db.query("UPDATE notifications SET read_at=UTC_TIMESTAMP() WHERE id=? AND user_id=?",[req.params.id,req.user.id]);return r.affectedRows?res.json({message:"Notifikasi ditandai dibaca."}):res.status(404).json({message:"Notifikasi tidak ditemukan."});}catch(e){return res.status(500).json({message:"Gagal memperbarui notifikasi."});}}
async function markAllNotificationsRead(req,res){try{await ensureTables();await db.query("UPDATE notifications SET read_at=UTC_TIMESTAMP() WHERE user_id=? AND read_at IS NULL",[req.user.id]);return res.json({message:"Semua notifikasi ditandai dibaca."});}catch(e){return res.status(500).json({message:"Gagal memperbarui notifikasi."});}}
async function listQrShares(req,res){try{await ensureTables();const [rows]=await db.query("SELECT q.id,DATE_FORMAT(q.expires_at,'%Y-%m-%dT%H:%i:%sZ') AS expires_at,q.used_at,q.revoked_at,q.created_at,d.full_name AS doctor_name FROM qr_access_tokens q LEFT JOIN users d ON d.id=q.doctor_id WHERE q.patient_id=? ORDER BY q.created_at DESC LIMIT 20",[req.user.id]);return res.json({shares:rows});}catch(e){return res.status(500).json({message:"Gagal memuat QR."});}}
async function revokeQrShare(req,res){try{await ensureTables();const [r]=await db.query("UPDATE qr_access_tokens SET revoked_at=UTC_TIMESTAMP() WHERE id=? AND patient_id=? AND revoked_at IS NULL",[req.params.id,req.user.id]);return r.affectedRows?res.json({message:"Token QR dicabut."}):res.status(404).json({message:"Token QR tidak ditemukan."});}catch(e){return res.status(500).json({message:"Gagal mencabut QR."});}}
async function logPatientAccessChange(req,res){try{const doctorId=Number(req.params.doctorId);if(!Number.isSafeInteger(doctorId)||doctorId<1)return res.status(400).json({message:"Dokter tidak valid."});const [[p],[d]]=await Promise.all([db.query("SELECT wallet_address FROM users WHERE id=? AND role='patient'",[req.user.id]),db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'",[doctorId])]);if(!p.length||!d.length)return res.status(404).json({message:"Akun tidak ditemukan."});const active=Boolean(await medicalRecordContract.accessPermissions(p[0].wallet_address,d[0].wallet_address));if(active!==Boolean(req.body.granted))return res.status(409).json({message:"Status transaksi blockchain belum sesuai."});await notify(doctorId,active?"access_granted":"access_revoked",active?"Pasien memberikan akses":"Pasien mencabut akses",active?"Pasien memberikan izin akses rekam medis Anda.":"Pasien mencabut izin akses rekam medis.");if(!active){const expiry=await medicalRecordContract.emergencyAccessExpiry(p[0].wallet_address,d[0].wallet_address);if(expiry===0n)await db.query("UPDATE emergency_access_requests SET status='revoked',revocation_transaction_hash=?,reviewed_at=UTC_TIMESTAMP() WHERE patient_id=? AND doctor_id=? AND status='approved'",[req.body.transactionHash||null,req.user.id,doctorId]).catch(()=>{});}await logAuditEvent({actorUserId:req.user.id,actorWallet:p[0].wallet_address,patientUserId:req.user.id,patientWallet:p[0].wallet_address,doctorUserId:doctorId,doctorWallet:d[0].wallet_address,eventType:active?"access_granted":"access_revoked",description:active?"Pasien memberikan izin akses kepada dokter":"Pasien mencabut izin akses dokter",transactionHash:req.body.transactionHash||null});return res.json({message:"Aktivitas akses tercatat."});}catch(e){console.error("Access change notification:",e.message);return res.status(503).json({message:"Gagal memverifikasi aktivitas akses."});}}
module.exports={ensureTables,notify,notifyAdmins,getHealthProfile,saveHealthProfile,createPrescription,listPrescriptions,createQrToken,claimQrToken,listAccessRequests,reviewAccessRequest,listNotifications,markNotificationRead,markAllNotificationsRead,listQrShares,revokeQrShare,logPatientAccessChange};
