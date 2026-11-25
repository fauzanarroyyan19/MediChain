const { ethers } = require("ethers");
const db = require("../config/database");
const { medicalRecordContract, ensureMedicalRecordFilesTable } = require("../services/blockchainService");
const { logAuditEvent } = require("../services/auditService");
const { notify, notifyAdmins } = require("./healthFeatureController");
const { ensureAppointmentsTable } = require("./appointmentController");

async function ensureEmergencyRequestsTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS emergency_access_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT UNSIGNED NOT NULL, doctor_id BIGINT UNSIGNED NOT NULL,
    patient_wallet VARCHAR(42) NOT NULL, doctor_wallet VARCHAR(42) NOT NULL,
    reason VARCHAR(1000) NOT NULL, duration_hours TINYINT UNSIGNED NOT NULL,
    status ENUM('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending',
    transaction_hash CHAR(66) NULL, revocation_transaction_hash CHAR(66) NULL, reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, reviewed_at TIMESTAMP NULL,
    INDEX idx_emergency_status(status), INDEX idx_emergency_patient(patient_id)
  )`);
  const [columns] = await db.query("SHOW COLUMNS FROM emergency_access_requests");
  if (!columns.some((column) => column.Field === "revocation_transaction_hash")) await db.query("ALTER TABLE emergency_access_requests ADD COLUMN revocation_transaction_hash CHAR(66) NULL");
  if (!columns.find((column) => column.Field === "status")?.Type.includes("'revoked'")) await db.query("ALTER TABLE emergency_access_requests MODIFY status ENUM('pending','approved','rejected','revoked') NOT NULL DEFAULT 'pending'");
}

async function requestEmergencyAccess(req, res) {
  const patientId = Number(req.body.patientId);
  const durationHours = Number(req.body.durationHours);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isSafeInteger(patientId) || patientId < 1 || !Number.isInteger(durationHours) || durationHours < 1 || durationHours > 24 || reason.length < 20 || reason.length > 1000) {
    return res.status(400).json({ message: "Pasien, durasi 1–24 jam, dan alasan darurat minimal 20 karakter wajib diisi." });
  }
  try {
    await ensureAppointmentsTable();
    const [[patient], [doctor]] = await Promise.all([
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='patient'", [patientId]),
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]),
    ]);
    if (!patient.length || !doctor.length || !patient[0].wallet_address || !doctor[0].wallet_address) return res.status(404).json({ message: "Pasien atau wallet tidak ditemukan." });
    const status = await medicalRecordContract.doctors(doctor[0].wallet_address);
    if (!status.registered || !status.verified) return res.status(403).json({ message: "Dokter harus terverifikasi di blockchain." });
    const [appointments] = await db.query("SELECT id FROM appointments WHERE doctor_id=? AND patient_id=? LIMIT 1", [req.user.id, patientId]);
    const alreadyAuthorized = await medicalRecordContract.accessPermissions(patient[0].wallet_address, doctor[0].wallet_address);
    if (!appointments.length && !alreadyAuthorized) return res.status(403).json({ message: "Permintaan darurat hanya dapat diajukan untuk pasien yang pernah berkonsultasi atau memberi akses kepada dokter." });
    if (await medicalRecordContract.regularAccessPermissions(patient[0].wallet_address, doctor[0].wallet_address)) return res.status(409).json({ message: "Dokter sudah memiliki izin reguler aktif untuk pasien ini." });
    if (await medicalRecordContract.emergencyAccessExpiry(patient[0].wallet_address, doctor[0].wallet_address) > BigInt(Math.floor(Date.now() / 1000))) return res.status(409).json({ message: "Emergency access untuk pasien ini masih aktif." });
    await ensureEmergencyRequestsTable();
    const [pending] = await db.query("SELECT id FROM emergency_access_requests WHERE patient_id=? AND doctor_id=? AND status='pending'", [patientId, req.user.id]);
    if (pending.length) return res.status(409).json({ message: "Permintaan akses darurat untuk pasien ini masih ditinjau." });
    const [result] = await db.query("INSERT INTO emergency_access_requests(patient_id,doctor_id,patient_wallet,doctor_wallet,reason,duration_hours) VALUES(?,?,?,?,?,?)", [patientId, req.user.id, patient[0].wallet_address, doctor[0].wallet_address, reason, durationHours]);
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctor[0].wallet_address, doctorUserId: req.user.id, doctorWallet: doctor[0].wallet_address, patientUserId: patientId, patientWallet: patient[0].wallet_address, eventType: "emergency_access_requested", description: `Dokter mengajukan akses darurat ${durationHours} jam` });
    await notify(patientId, "emergency_access_requested", "Permintaan akses darurat", "Dokter mengajukan permintaan akses darurat. Admin akan meninjau dan seluruh akses dicatat.", result.insertId);
    await notifyAdmins("emergency_access_pending", "Emergency access perlu ditinjau", "Dokter mengajukan akses darurat yang menunggu persetujuan admin.", result.insertId);
    return res.status(201).json({ id: result.insertId, message: "Permintaan darurat dikirim untuk peninjauan admin." });
  } catch (error) {
    console.error("Emergency access request:", error.message);
    return res.status(500).json({ message: "Gagal membuat permintaan akses darurat." });
  }
}

async function getEmergencyPatientCandidates(req, res) {
  try {
    await ensureAppointmentsTable();
    const [patients] = await db.query(`SELECT DISTINCT u.id,u.full_name,u.wallet_address
      FROM appointments a JOIN users u ON u.id=a.patient_id
      WHERE a.doctor_id=? AND u.role='patient' AND u.wallet_address IS NOT NULL
      ORDER BY u.full_name ASC`, [req.user.id]);
    return res.json({ patients });
  } catch (error) {
    console.error("Emergency patient candidates:", error.message);
    return res.status(500).json({ message: "Gagal memuat pasien yang pernah berkonsultasi dengan dokter." });
  }
}

async function reportDoctorRegistration(req, res) {
  const transactionHash = req.body.transactionHash || "";
  if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return res.status(400).json({ message: "Hash transaksi registrasi tidak valid." });
  try {
    const [rows] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]);
    const wallet = rows[0]?.wallet_address;
    if (!wallet) return res.status(409).json({ message: "Akun dokter belum menghubungkan wallet." });
    const receipt = await medicalRecordContract.runner.provider.getTransactionReceipt(transactionHash);
    if (!receipt || receipt.status !== 1 || receipt.from?.toLowerCase() !== wallet.toLowerCase() || receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase()) return res.status(400).json({ message: "Transaksi registrasi bukan milik wallet dokter." });
    const iface = new ethers.Interface(require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json").abi);
    const matched = receipt.logs.some((log) => { try { const event=iface.parseLog(log); return event?.name === "DoctorRegistered" && event.args.doctor.toLowerCase() === wallet.toLowerCase(); } catch { return false; } });
    if (!matched) return res.status(400).json({ message: "Transaksi tidak memuat event registrasi dokter." });
    await notifyAdmins("doctor_registration_pending", "Dokter menunggu verifikasi", "Dokter baru berhasil mendaftar di blockchain dan menunggu verifikasi admin.", req.user.id);
    return res.json({ message: "Admin diberi tahu tentang registrasi dokter." });
  } catch (error) {
    console.error("Doctor registration notification:", error.message);
    return res.status(503).json({ message: "Registrasi berhasil, tetapi notifikasi admin gagal dikirim." });
  }
}

async function reportDoctorVerification(req, res) {
  const doctorId = Number(req.params.doctorId);
  const transactionHash = req.body.transactionHash || "";
  if (!Number.isSafeInteger(doctorId) || doctorId < 1 || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return res.status(400).json({ message: "Dokter atau transaksi tidak valid." });
  try {
    const [[doctor], [admin]] = await Promise.all([
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='doctor'", [doctorId]),
      db.query("SELECT wallet_address FROM users WHERE id=? AND role='admin'", [req.user.id]),
    ]);
    if (!doctor.length || !doctor[0].wallet_address) return res.status(404).json({ message: "Dokter tidak ditemukan." });
    const receipt = await medicalRecordContract.runner.provider.getTransactionReceipt(transactionHash);
    const owner = await medicalRecordContract.owner();
    if (!receipt || receipt.status !== 1 || receipt.from?.toLowerCase() !== owner.toLowerCase() || receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase() || (admin[0]?.wallet_address && admin[0].wallet_address.toLowerCase() !== owner.toLowerCase())) return res.status(400).json({ message: "Transaksi verifikasi harus berasal dari wallet owner kontrak." });
    const iface = new ethers.Interface(require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json").abi);
    const matched = receipt.logs.some((log) => { try { const event=iface.parseLog(log); return event?.name === "DoctorVerified" && event.args.doctor.toLowerCase() === doctor[0].wallet_address.toLowerCase(); } catch { return false; } });
    if (!matched) return res.status(400).json({ message: "Transaksi tidak memuat event verifikasi dokter." });
    await notify(doctorId, "doctor_verified", "Dokter terverifikasi", "Admin telah memverifikasi akun dokter Anda di blockchain.", doctorId);
    return res.json({ message: "Dokter diberi tahu bahwa verifikasinya berhasil." });
  } catch (error) {
    console.error("Doctor verification notification:", error.message);
    return res.status(503).json({ message: "Verifikasi berhasil, tetapi notifikasi dokter gagal dikirim." });
  }
}

async function getEmergencyAccessRequests(req, res) {
  try {
    await ensureEmergencyRequestsTable();
    const [requests] = await db.query(`SELECT r.*, p.full_name AS patient_name, d.full_name AS doctor_name, a.full_name AS reviewer_name
      FROM emergency_access_requests r JOIN users p ON p.id=r.patient_id JOIN users d ON d.id=r.doctor_id
      LEFT JOIN users a ON a.id=r.reviewed_by ORDER BY (r.status='pending') DESC,r.created_at DESC`);
    return res.json({ requests });
  } catch (error) {
    console.error("List emergency access:", error.message);
    return res.status(500).json({ message: "Gagal memuat permintaan akses darurat." });
  }
}

async function reviewEmergencyAccess(req, res) {
  const id = Number(req.params.id);
  const decision = req.body.decision;
  const transactionHash = req.body.transactionHash || null;
  if (!Number.isSafeInteger(id) || id < 1 || !["approved", "rejected"].includes(decision)) return res.status(400).json({ message: "Keputusan tidak valid." });
  try {
    await ensureEmergencyRequestsTable();
    const [rows] = await db.query("SELECT * FROM emergency_access_requests WHERE id=? AND status='pending'", [id]);
    if (!rows.length) return res.status(404).json({ message: "Permintaan tidak ada atau sudah ditinjau." });
    const request = rows[0];
    if (decision === "approved") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || "")) return res.status(400).json({ message: "Hash transaksi persetujuan blockchain wajib disertakan." });
      const receipt = await medicalRecordContract.runner.provider.getTransactionReceipt(transactionHash);
      const owner = await medicalRecordContract.owner();
      if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase() || receipt.from?.toLowerCase() !== owner.toLowerCase()) return res.status(400).json({ message: "Transaksi tidak valid atau bukan dari wallet admin pemilik kontrak." });
      const iface = new ethers.Interface(require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json").abi);
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(request.reason));
      let matchedEvent = null;
      const matched = receipt.logs.some((log) => {
        try {
          const parsed = iface.parseLog(log);
          const valid = parsed?.name === "EmergencyAccessGranted" && parsed.args.patient.toLowerCase() === request.patient_wallet.toLowerCase() && parsed.args.doctor.toLowerCase() === request.doctor_wallet.toLowerCase() && parsed.args.reasonHash.toLowerCase() === reasonHash.toLowerCase();
          if (valid) matchedEvent = parsed;
          return valid;
        } catch { return false; }
      });
      if (!matched) return res.status(400).json({ message: "Transaksi tidak cocok dengan permintaan dan alasan darurat." });
      const block = await medicalRecordContract.runner.provider.getBlock(receipt.blockNumber);
      const requestedSeconds = Number(request.duration_hours) * 3600;
      const grantedSeconds = Number(matchedEvent.args.expiresAt) - Number(block.timestamp);
      if (grantedSeconds <= 0 || grantedSeconds > requestedSeconds + 180) return res.status(400).json({ message: "Durasi transaksi melebihi durasi permintaan darurat." });
    }
    await db.query("UPDATE emergency_access_requests SET status=?,transaction_hash=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?", [decision, transactionHash, req.user.id, id]);
    if (decision === "approved") {
      const [[admin]] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='admin'", [req.user.id]);
      await logAuditEvent({ actorUserId: req.user.id, actorWallet: admin?.wallet_address || null, patientUserId: request.patient_id, patientWallet: request.patient_wallet, doctorUserId: request.doctor_id, doctorWallet: request.doctor_wallet, eventType: "emergency_access_approved", description: `Admin menyetujui akses darurat ${request.duration_hours} jam`, transactionHash });
      await notify(request.patient_id, "emergency_access_granted", "Akses darurat diberikan", `Akses darurat diberikan kepada dokter selama maksimal ${request.duration_hours} jam.`);
      await notify(request.doctor_id, "emergency_access_granted", "Akses darurat disetujui", "Admin menyetujui akses darurat. Aktivitas akses dicatat di Audit Trail.");
    } else {
      await notify(request.doctor_id, "emergency_access_rejected", "Permintaan akses darurat ditolak", "Admin menolak permintaan akses darurat.");
    }
    return res.json({ message: decision === "approved" ? "Akses darurat diverifikasi dan disetujui." : "Permintaan ditolak." });
  } catch (error) {
    console.error("Review emergency access:", error.message);
    return res.status(500).json({ message: "Gagal meninjau permintaan akses darurat." });
  }
}

async function revokeEmergencyAccessRequest(req, res) {
  const id = Number(req.params.id);
  const transactionHash = req.body.transactionHash || "";
  if (!Number.isSafeInteger(id) || id < 1 || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash)) return res.status(400).json({ message: "ID atau hash transaksi tidak valid." });
  try {
    await ensureEmergencyRequestsTable();
    const [rows] = await db.query("SELECT * FROM emergency_access_requests WHERE id=? AND status='approved'", [id]);
    if (!rows.length) return res.status(404).json({ message: "Akses aktif tidak ditemukan." });
    const request = rows[0];
    const receipt = await medicalRecordContract.runner.provider.getTransactionReceipt(transactionHash);
    const owner = await medicalRecordContract.owner();
    if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase() || receipt.from?.toLowerCase() !== owner.toLowerCase()) return res.status(400).json({ message: "Transaksi pencabutan harus berasal dari owner kontrak." });
    const iface = new ethers.Interface(require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json").abi);
    const matched = receipt.logs.some((log) => {
      try { const parsed = iface.parseLog(log); return parsed?.name === "EmergencyAccessRevoked" && parsed.args.patient.toLowerCase() === request.patient_wallet.toLowerCase() && parsed.args.doctor.toLowerCase() === request.doctor_wallet.toLowerCase(); }
      catch { return false; }
    });
    if (!matched) return res.status(400).json({ message: "Event pencabutan tidak cocok dengan pasangan pasien dan dokter." });
    await db.query("UPDATE emergency_access_requests SET status='revoked',revocation_transaction_hash=?,reviewed_at=UTC_TIMESTAMP() WHERE id=?", [transactionHash, id]);
    const [[admin]] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='admin'", [req.user.id]);
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: admin?.wallet_address || null, patientUserId: request.patient_id, patientWallet: request.patient_wallet, doctorUserId: request.doctor_id, doctorWallet: request.doctor_wallet, eventType: "emergency_access_revoked", description: "Admin mencabut emergency access sebelum kedaluwarsa", transactionHash });
    await notify(request.patient_id, "emergency_access_revoked", "Akses darurat dicabut", "Akses darurat dokter telah dicabut oleh admin.");
    await notify(request.doctor_id, "emergency_access_revoked", "Akses darurat dicabut", "Akses darurat Anda telah dicabut oleh admin.");
    return res.json({ message: "Emergency access dicabut dan tercatat di blockchain." });
  } catch (error) {
    console.error("Revoke emergency access:", error.message);
    return res.status(500).json({ message: "Gagal memverifikasi pencabutan emergency access." });
  }
}

async function getDoctorPatientRecords(req, res) {
  const patientId = Number(req.params.patientId);
  if (!Number.isSafeInteger(patientId) || patientId < 1) return res.status(400).json({ message: "ID pasien tidak valid." });
  try {
    const [[patient], [doctor]] = await Promise.all([
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='patient'", [patientId]),
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]),
    ]);
    if (!patient.length || !doctor.length || !patient[0].wallet_address || !doctor[0].wallet_address) return res.status(404).json({ message: "Pasien tidak ditemukan." });
    if (!(await medicalRecordContract.accessPermissions(patient[0].wallet_address, doctor[0].wallet_address))) return res.status(403).json({ message: "Izin akses pasien tidak aktif." });
    const emergencyExpiry = await medicalRecordContract.emergencyAccessExpiry(patient[0].wallet_address, doctor[0].wallet_address);
    const regularAccess = await medicalRecordContract.regularAccessPermissions(patient[0].wallet_address, doctor[0].wallet_address);
    if (!regularAccess && emergencyExpiry > BigInt(Math.floor(Date.now() / 1000))) await notify(patientId, "emergency_access_used", "Akses darurat digunakan", "Dokter membuka metadata rekam medis menggunakan emergency access.");
    await ensureMedicalRecordFilesTable();
    const [rows] = await db.query("SELECT cid,transaction_hash,commitment,category,description,version_number,previous_transaction_hash,change_reason,signature,signed_by,signed_at,created_at FROM medical_record_files WHERE LOWER(patient_wallet)=LOWER(?) ORDER BY created_at DESC", [patient[0].wallet_address]);
    const records = [];
    for (const record of rows) {
      if (await medicalRecordContract.revokedCommitments(patient[0].wallet_address, record.commitment)) continue;
      records.push(record);
    }
    if (req.versionCandidates) {
      const onCurrentChain = [];
      for (const record of records) {
        if (await medicalRecordContract.knownCommitments(patient[0].wallet_address, record.commitment)) onCurrentChain.push(record);
      }
      const previousHashes = new Set(onCurrentChain.map((record) => record.previous_transaction_hash?.toLowerCase()).filter(Boolean));
      const currentVersions = onCurrentChain.filter((record) => !previousHashes.has(record.transaction_hash.toLowerCase()));
      await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctor[0].wallet_address, doctorUserId: req.user.id, doctorWallet: doctor[0].wallet_address, patientUserId: patientId, patientWallet: patient[0].wallet_address, eventType: "patient_records_accessed", description: "Dokter memeriksa versi aktif untuk revisi record" });
      return res.json({ records: currentVersions });
    }
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctor[0].wallet_address, doctorUserId: req.user.id, doctorWallet: doctor[0].wallet_address, patientUserId: patientId, patientWallet: patient[0].wallet_address, eventType: !regularAccess && emergencyExpiry > BigInt(Math.floor(Date.now() / 1000)) ? "emergency_access_used" : "patient_records_accessed", description: "Dokter membuka metadata riwayat rekam medis pasien" });
    return res.json({ records });
  } catch (error) {
    console.error("Doctor access records:", error.message);
    return res.status(500).json({ message: "Gagal memuat metadata rekam medis pasien." });
  }
}

async function getVersionableRecords(req, res) {
  req.params.patientId = req.query.patientId;
  req.versionCandidates = true;
  return getDoctorPatientRecords(req, res);
}

module.exports = { requestEmergencyAccess, getEmergencyPatientCandidates, reportDoctorRegistration, reportDoctorVerification, getEmergencyAccessRequests, reviewEmergencyAccess, revokeEmergencyAccessRequest, getDoctorPatientRecords, getVersionableRecords };
