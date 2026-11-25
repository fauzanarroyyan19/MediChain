const db = require("../config/database");
const { medicalRecordContract, ensureRecordDeletionRequestsTable, ensureMedicalRecordFilesTable } = require("../services/blockchainService");
const { ethers } = require("ethers");
const { logAuditEvent } = require("../services/auditService");
const { notify, notifyAdmins } = require("./healthFeatureController");

async function createPatientDeletionRequest(req, res) {
  try {
    const { transactionHash, reason } = req.body;
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash || "")) {
      return res.status(400).json({ message: "Transaksi rekam medis tidak valid." });
    }
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.trim().length > 1000) {
      return res.status(400).json({ message: "Alasan harus berisi 5 sampai 1000 karakter." });
    }

    const [patients] = await db.query(
      "SELECT wallet_address FROM users WHERE id = ? AND role = 'patient' LIMIT 1",
      [req.user.id]
    );
    const patientWallet = patients[0]?.wallet_address;
    if (!patientWallet) return res.status(409).json({ message: "Hubungkan wallet pasien terlebih dahulu." });

    const events = await medicalRecordContract.queryFilter(
      medicalRecordContract.filters.RecordAdded(patientWallet),
      0,
      "latest"
    );
    const ownsRecord = events.some(
      (event) => event.transactionHash.toLowerCase() === transactionHash.toLowerCase()
    );
    await ensureRecordDeletionRequestsTable();
    await ensureMedicalRecordFilesTable();
    const [metadataRows] = await db.query("SELECT id FROM medical_record_files WHERE transaction_hash=? AND LOWER(patient_wallet)=LOWER(?) LIMIT 1", [transactionHash, patientWallet]);
    if (!ownsRecord && !metadataRows.length) return res.status(404).json({ message: "Rekam medis tersebut tidak ditemukan untuk akun pasien ini." });
    const [pending] = await db.query(
      `SELECT id FROM record_deletion_requests
       WHERE patient_id = ? AND transaction_hash = ? AND status = 'pending' LIMIT 1`,
      [req.user.id, transactionHash]
    );
    if (pending.length) return res.status(409).json({ message: "Permintaan untuk record ini masih menunggu peninjauan." });

    const [result] = await db.query(
      `INSERT INTO record_deletion_requests
       (patient_id, requester_user_id, requester_role, patient_wallet, transaction_hash, reason)
       VALUES (?, ?, 'patient', ?, ?, ?)`,
      [req.user.id, req.user.id, patientWallet, transactionHash, reason.trim()]
    );
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: patientWallet, patientUserId: req.user.id, patientWallet, eventType: "record_revocation_requested", description: "Pasien mengajukan peninjauan penonaktifan record" });
    await notifyAdmins("record_revocation_pending", "Permintaan penonaktifan record", "Pasien mengajukan penonaktifan record yang menunggu peninjauan admin.", result.insertId);
    return res.status(201).json({
      message: "Permintaan penghapusan berhasil diajukan untuk ditinjau.",
      requestId: result.insertId,
      status: "pending",
    });
  } catch (error) {
    console.error("Create record deletion request error:", error.message);
    return res.status(500).json({ message: "Gagal mengajukan permintaan penghapusan." });
  }
}

async function createDoctorRevocationRequest(req, res) {
  const patientId = Number(req.body.patientId);
  const transactionHash = req.body.transactionHash;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!Number.isSafeInteger(patientId) || patientId < 1 || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash || "") || reason.length < 5 || reason.length > 1000) return res.status(400).json({ message: "Pasien, transaksi, dan alasan 5–1000 karakter wajib diisi." });
  try {
    const [[patient], [doctor]] = await Promise.all([
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='patient'", [patientId]),
      db.query("SELECT id,wallet_address FROM users WHERE id=? AND role='doctor'", [req.user.id]),
    ]);
    if (!patient.length || !doctor.length || !patient[0].wallet_address || !doctor[0].wallet_address) return res.status(404).json({ message: "Pasien atau wallet tidak ditemukan." });
    if (!(await medicalRecordContract.accessPermissions(patient[0].wallet_address, doctor[0].wallet_address))) return res.status(403).json({ message: "Izin blockchain pasien tidak aktif." });
    const events = await medicalRecordContract.queryFilter(medicalRecordContract.filters.RecordAdded(patient[0].wallet_address), 0, "latest");
    const recordEvent = events.find((event) => event.transactionHash.toLowerCase() === transactionHash.toLowerCase());
    await ensureRecordDeletionRequestsTable();
    await ensureMedicalRecordFilesTable();
    const [recordRows] = await db.query("SELECT doctor_wallet FROM medical_record_files WHERE transaction_hash=? AND LOWER(patient_wallet)=LOWER(?) LIMIT 1", [transactionHash, patient[0].wallet_address]);
    const uploaderWallet = recordEvent?.args.doctor || recordRows[0]?.doctor_wallet;
    if (!uploaderWallet || uploaderWallet.toLowerCase() !== doctor[0].wallet_address.toLowerCase()) return res.status(404).json({ message: "Dokter hanya dapat mengajukan penonaktifan untuk record yang diunggahnya." });
    const [pending] = await db.query("SELECT id FROM record_deletion_requests WHERE transaction_hash=? AND status='pending'", [transactionHash]);
    if (pending.length) return res.status(409).json({ message: "Record sudah memiliki permintaan penonaktifan yang menunggu peninjauan." });
    await db.query("INSERT INTO record_deletion_requests(patient_id,requester_user_id,requester_role,patient_wallet,transaction_hash,reason) VALUES(?,?,'doctor',?,?,?)", [patientId, req.user.id, patient[0].wallet_address, transactionHash, reason]);
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctor[0].wallet_address, doctorUserId: req.user.id, doctorWallet: doctor[0].wallet_address, patientUserId: patientId, patientWallet: patient[0].wallet_address, eventType: "record_revocation_requested", description: "Dokter mengajukan peninjauan penonaktifan record" });
    await notify(patientId, "record_revocation_requested", "Permintaan penonaktifan record", "Dokter mengajukan penonaktifan record dan menunggu peninjauan admin.");
    await notifyAdmins("record_revocation_pending", "Permintaan penonaktifan record", "Dokter mengajukan penonaktifan record yang menunggu peninjauan admin.");
    return res.status(201).json({ message: "Permintaan penonaktifan dikirim kepada admin untuk ditinjau." });
  } catch (error) {
    console.error("Doctor record revocation request:", error.message);
    return res.status(500).json({ message: "Gagal membuat permintaan penonaktifan." });
  }
}

async function getPatientDeletionRequests(req, res) {
  try {
    await ensureRecordDeletionRequestsTable();
    const [requests] = await db.query(
      `SELECT id, transaction_hash, reason, status, review_note, created_at, reviewed_at
       FROM record_deletion_requests WHERE patient_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    return res.json({ requests });
  } catch (error) {
    console.error("Get patient deletion requests error:", error.message);
    return res.status(500).json({ message: "Gagal mengambil status permintaan." });
  }
}

async function getAdminDeletionRequests(req, res) {
  try {
    await ensureRecordDeletionRequestsTable();
    const [requests] = await db.query(
      `SELECT r.id, r.patient_wallet, u.full_name AS patient_name, u.email AS patient_email,
              r.transaction_hash, r.reason, r.status, r.review_note,
              r.created_at, r.reviewed_at, r.revocation_transaction_hash, reviewer.full_name AS reviewer_name,
              requester.full_name AS requester_name, r.requester_role
       FROM record_deletion_requests r
       JOIN users u ON u.id = r.patient_id
       LEFT JOIN users reviewer ON reviewer.id = r.reviewed_by
       LEFT JOIN users requester ON requester.id = COALESCE(r.requester_user_id, r.patient_id)
       ORDER BY (r.status = 'pending') DESC, r.created_at DESC`
    );
    const patientWallets = [...new Set(requests.map((item) => item.patient_wallet))];
    const events = await Promise.all(patientWallets.map((wallet) => medicalRecordContract.queryFilter(medicalRecordContract.filters.RecordAdded(wallet), 0, "latest")));
    const commitments = new Map(events.flat().map((event) => [event.transactionHash.toLowerCase(), event.args.commitment]));
    await ensureMedicalRecordFilesTable();
    for (const request of requests) {
      if (commitments.has(request.transaction_hash.toLowerCase())) continue;
      const [metadataRows] = await db.query("SELECT commitment FROM medical_record_files WHERE transaction_hash=? AND LOWER(patient_wallet)=LOWER(?) LIMIT 1", [request.transaction_hash, request.patient_wallet]);
      if (metadataRows[0]) commitments.set(request.transaction_hash.toLowerCase(), metadataRows[0].commitment);
    }
    requests.forEach((item) => { item.commitment = commitments.get(item.transaction_hash.toLowerCase()) || null; });
    return res.json({ requests });
  } catch (error) {
    console.error("Get admin deletion requests error:", error.message);
    return res.status(500).json({ message: "Gagal mengambil daftar permintaan." });
  }
}

async function reviewDeletionRequest(req, res) {
  try {
    const requestId = Number(req.params.id);
    const { decision, reviewNote = "", revocationTransactionHash = "" } = req.body;
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
      return res.status(400).json({ message: "ID permintaan tidak valid." });
    }
    if (!["approved", "rejected"].includes(decision)) {
      return res.status(400).json({ message: "Keputusan harus approved atau rejected." });
    }
    if (typeof reviewNote !== "string" || reviewNote.length > 1000) {
      return res.status(400).json({ message: "Catatan maksimal 1000 karakter." });
    }
    await ensureRecordDeletionRequestsTable();
    const [requests] = await db.query("SELECT * FROM record_deletion_requests WHERE id=? AND status='pending'", [requestId]);
    if (!requests.length) return res.status(404).json({ message: "Permintaan tidak ditemukan atau sudah ditinjau." });
    const request = requests[0];
    if (decision === "approved") {
      if (!/^0x[0-9a-fA-F]{64}$/.test(revocationTransactionHash)) return res.status(400).json({ message: "Persetujuan wajib disertai transaksi penonaktifan on-chain." });
      const recordEvents = await medicalRecordContract.queryFilter(medicalRecordContract.filters.RecordAdded(request.patient_wallet), 0, "latest");
      const recordEvent = recordEvents.find((event) => event.transactionHash.toLowerCase() === request.transaction_hash.toLowerCase());
      let commitment = recordEvent?.args.commitment;
      if (!commitment) {
        await ensureMedicalRecordFilesTable();
        const [metadataRows] = await db.query("SELECT commitment FROM medical_record_files WHERE transaction_hash=? AND LOWER(patient_wallet)=LOWER(?) LIMIT 1", [request.transaction_hash, request.patient_wallet]);
        commitment = metadataRows[0]?.commitment;
      }
      if (!commitment) return res.status(404).json({ message: "Commitment record tidak ditemukan." });
      const receipt = await medicalRecordContract.runner.provider.getTransactionReceipt(revocationTransactionHash);
      const owner = await medicalRecordContract.owner();
      if (!receipt || receipt.status !== 1 || receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase() || receipt.from?.toLowerCase() !== owner.toLowerCase()) return res.status(400).json({ message: "Transaksi penonaktifan bukan transaksi valid dari admin pemilik kontrak." });
      const iface = new ethers.Interface(require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json").abi);
      const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(request.reason));
      const matched = receipt.logs.some((log) => {
        try { const parsed = iface.parseLog(log); return parsed?.name === "RecordRevoked" && parsed.args.patient.toLowerCase() === request.patient_wallet.toLowerCase() && parsed.args.commitment.toLowerCase() === commitment.toLowerCase() && parsed.args.reasonHash.toLowerCase() === reasonHash.toLowerCase(); }
        catch { return false; }
      });
      if (!matched) return res.status(400).json({ message: "Event blockchain tidak sesuai dengan record dan alasan pengajuan." });
    }
    const [result] = await db.query(
      `UPDATE record_deletion_requests
       SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = NOW(), revocation_transaction_hash = ?
       WHERE id = ? AND status = 'pending'`,
      [decision, reviewNote.trim() || null, req.user.id, decision === "approved" ? revocationTransactionHash : null, requestId]
    );
    if (!result.affectedRows) {
      return res.status(404).json({ message: "Permintaan tidak ditemukan atau sudah ditinjau." });
    }
    const [[admin]] = await db.query("SELECT wallet_address FROM users WHERE id=? AND role='admin'", [req.user.id]);
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: admin?.wallet_address || null, patientUserId: request.patient_id, patientWallet: request.patient_wallet, eventType: decision === "approved" ? "record_revoked" : "record_revocation_rejected", description: decision === "approved" ? "Admin menonaktifkan record setelah peninjauan" : "Admin menolak permintaan penonaktifan record", transactionHash: decision === "approved" ? revocationTransactionHash : null });
    const requesterId = Number(request.requester_user_id || request.patient_id);
    if (decision === "approved") {
      await notify(request.patient_id, "record_revoked", "Rekam medis dinonaktifkan", "Admin telah menonaktifkan rekam medis setelah peninjauan.");
      if (requesterId !== Number(request.patient_id)) await notify(requesterId, "record_revoked", "Permintaan penonaktifan disetujui", "Admin telah menonaktifkan record yang Anda ajukan.");
    } else {
      await notify(requesterId, "record_revocation_rejected", "Permintaan penonaktifan ditolak", reviewNote.trim() || "Admin menolak permintaan penonaktifan record.");
    }
    return res.json({ message: "Keputusan peninjauan tersimpan.", status: decision });
  } catch (error) {
    console.error("Review deletion request error:", error.message);
    return res.status(500).json({ message: "Gagal menyimpan keputusan." });
  }
}

module.exports = {
  createPatientDeletionRequest,
  createDoctorRevocationRequest,
  getPatientDeletionRequests,
  getAdminDeletionRequests,
  reviewDeletionRequest,
};
