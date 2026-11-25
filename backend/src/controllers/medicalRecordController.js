const { ethers } = require("ethers");
const db = require("../config/database");
const artifact = require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json");
const {
  medicalRecordContract,
  getDoctorAddressForUser,
  ensureMedicalRecordFilesTable,
  ensureRecordDeletionRequestsTable,
} = require("../services/blockchainService");
const { notify } = require("./healthFeatureController");
const { logAuditEvent } = require("../services/auditService");
const { ensureAiTables } = require("./aiController");

const MAX_ENCRYPTED_FILE_SIZE = 12 * 1024 * 1024;
const RECORD_CATEGORIES = new Set([
  "Consultation",
  "Laboratory Result",
  "Prescription",
  "Diagnosis",
  "Other",
]);

async function uploadEncryptedFile(req, res) {
  try {
    const doctorAddress = await getDoctorAddressForUser(req.user.id);
    if (!doctorAddress) return res.status(409).json({ message: "Hubungkan wallet dokter terlebih dahulu." });
    const doctor = await medicalRecordContract.doctors(doctorAddress);
    if (!doctor.registered || !doctor.verified) {
      return res.status(403).json({ message: "Dokter harus terdaftar dan terverifikasi di blockchain." });
    }
    if (!process.env.PINATA_JWT) {
      return res.status(503).json({ message: "IPFS belum dikonfigurasi. Tambahkan PINATA_JWT pada backend/.env." });
    }
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ message: "Data file terenkripsi tidak ditemukan." });
    }
    if (req.body.length > MAX_ENCRYPTED_FILE_SIZE) {
      return res.status(413).json({ message: "File terenkripsi melebihi batas 12 MB." });
    }
    let envelope;

try {
  envelope = JSON.parse(req.body.toString("utf8"));
} catch {
  return res.status(400).json({
    message: "Payload bukan envelope terenkripsi MediChain yang valid."
  });
}

function isValidBase64(value) {
  if (typeof value !== "string" || value.length === 0) return false;

  const normalized = value.replace(/=+$/, "");

  if (!/^[A-Za-z0-9+/]*$/.test(normalized)) return false;
  if (normalized.length % 4 === 1) return false;

  const decoded = Buffer.from(value, "base64");

  return decoded.toString("base64").replace(/=+$/, "") === normalized;
}

const validEnvelope =
  [1, 2].includes(envelope?.version) &&
  isValidBase64(envelope.salt) &&
  isValidBase64(envelope.iv) &&
  isValidBase64(envelope.ciphertext) &&
  Buffer.from(envelope.salt, "base64").length === 16 &&
  Buffer.from(envelope.iv, "base64").length === 12 &&
  Buffer.from(envelope.ciphertext, "base64").length > 0 &&
  (envelope.version === 1 || (
    isValidBase64(envelope.metadataIv) &&
    isValidBase64(envelope.metadata) &&
    Buffer.from(envelope.metadataIv, "base64").length === 12 &&
    Buffer.from(envelope.metadata, "base64").length > 0
  ));

if (!validEnvelope) {
  return res.status(400).json({
    message: "Format file terenkripsi tidak valid."
  });
}

    const form = new FormData();
    form.append("network", "public");
    form.append("file", new Blob([req.body], { type: "application/octet-stream" }), `medichain-${Date.now()}.enc`);
    form.append("cid_version", "v1");
    const response = await fetch("https://uploads.pinata.cloud/v3/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.PINATA_JWT}` },
      body: form,
    });
    const result = await response.json();
    if (!response.ok || !result?.data?.cid) {
      console.error("Pinata upload failed:", result?.error || result?.message || response.status);
      return res.status(502).json({ message: "Gagal mengunggah file terenkripsi ke IPFS." });
    }
    return res.status(201).json({ cid: result.data.cid, size: result.data.size });
  } catch (error) {
    console.error("Encrypted IPFS upload error:", error.message);
    return res.status(502).json({ message: "Upload IPFS gagal. Periksa koneksi backend dan konfigurasi Pinata." });
  }
}

async function saveRecordMetadata(req, res) {
  try {
    const doctorAddress = await getDoctorAddressForUser(req.user.id);
    if (!doctorAddress) return res.status(409).json({ message: "Hubungkan wallet dokter terlebih dahulu." });
    const {
      patientWallet,
      commitment,
      cid,
      transactionHash,
      category = "Other",
      description = "",
      previousTransactionHash = "",
      changeReason = "",
      signature = "",
    } = req.body;
    if (!ethers.isAddress(patientWallet) || !/^0x[0-9a-fA-F]{64}$/.test(commitment || "") ||
        !/^b[a-zA-Z0-9]{20,}$/.test(cid || "") || !/^0x[0-9a-fA-F]{64}$/.test(transactionHash || "")) {
      return res.status(400).json({ message: "Metadata rekam medis tidak valid." });
    }
    if (!RECORD_CATEGORIES.has(category) || typeof description !== "string" || description.length > 2000) {
      return res.status(400).json({ message: "Kategori atau deskripsi rekam medis tidak valid." });
    }
    if (previousTransactionHash && !/^0x[0-9a-fA-F]{64}$/.test(previousTransactionHash)) return res.status(400).json({ message: "Referensi versi sebelumnya tidak valid." });
    if (previousTransactionHash && (typeof changeReason !== "string" || changeReason.trim().length < 5 || changeReason.length > 1000)) return res.status(400).json({ message: "Alasan perubahan wajib diisi (5–1000 karakter)." });

    const doctor = await medicalRecordContract.doctors(doctorAddress);
    const allowed = await medicalRecordContract.accessPermissions(patientWallet, doctorAddress);
    if (!doctor.registered || !doctor.verified || !allowed) {
      return res.status(403).json({ message: "Dokter tidak lagi memiliki izin aktif untuk pasien ini." });
    }

const receipt = await medicalRecordContract.runner.getTransactionReceipt(transactionHash);

if (
  !receipt ||
  receipt.status !== 1 ||
  receipt.to?.toLowerCase() !== medicalRecordContract.target.toLowerCase() ||
  receipt.from?.toLowerCase() !== doctorAddress.toLowerCase()
) {
  return res.status(400).json({
    message: "Transaksi blockchain tidak valid atau bukan berasal dari wallet dokter."
  });
}
    const iface = new ethers.Interface(artifact.abi);
    const hasMatchingEvent = receipt.logs.some((log) => {
      try {
        const parsed = iface.parseLog(log);
        return parsed?.name === "RecordAdded" &&
          parsed.args.patient.toLowerCase() === patientWallet.toLowerCase() &&
          parsed.args.doctor.toLowerCase() === doctorAddress.toLowerCase() &&
          parsed.args.commitment.toLowerCase() === commitment.toLowerCase();
      } catch { return false; }
    });
    if (!hasMatchingEvent) return res.status(400).json({ message: "Transaksi tidak memuat catatan blockchain yang cocok." });

    await ensureMedicalRecordFilesTable();
    await ensureRecordDeletionRequestsTable();
    let previousCommitment = "";
    let versionNumber = 1;
    if (previousTransactionHash) {
      const [previousRows] = await db.query("SELECT commitment,version_number FROM medical_record_files WHERE transaction_hash=? AND LOWER(patient_wallet)=LOWER(?) LIMIT 1", [previousTransactionHash, patientWallet]);
      if (!previousRows.length || await medicalRecordContract.revokedCommitments(patientWallet, previousRows[0].commitment)) return res.status(409).json({ message: "Record versi sebelumnya tidak ditemukan atau sudah dinonaktifkan." });
      previousCommitment = previousRows[0].commitment;
      versionNumber = Number(previousRows[0].version_number) + 1;
    }
    const onChainVersion = Number(await medicalRecordContract.recordVersions(patientWallet, commitment));
    if (onChainVersion !== versionNumber) return res.status(409).json({ message: "Nomor versi metadata tidak cocok dengan blockchain." });
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) return res.status(400).json({ message: "Tanda tangan digital dokter wajib disertakan." });
    const signatureMessage = [
      "MediChain Record Signature",
      `Contract:${medicalRecordContract.target.toLowerCase()}`,
      "ChainId:31337",
      `Patient:${patientWallet.toLowerCase()}`,
      `Doctor:${doctorAddress.toLowerCase()}`,
      `Commitment:${commitment.toLowerCase()}`,
      `Transaction:${transactionHash.toLowerCase()}`,
      `Previous:${previousCommitment.toLowerCase() || "none"}`,
    ].join("\n");
    let recoveredSigner;
    try { recoveredSigner = ethers.verifyMessage(signatureMessage, signature); }
    catch { return res.status(400).json({ message: "Format tanda tangan digital tidak valid." }); }
    if (recoveredSigner.toLowerCase() !== doctorAddress.toLowerCase()) return res.status(403).json({ message: "Tanda tangan bukan berasal dari wallet dokter pengunggah." });
    await db.query(
      `INSERT INTO medical_record_files
       (patient_wallet, doctor_wallet, commitment, cid, transaction_hash, category, description,
        version_number, previous_transaction_hash, change_reason, signature, signed_by, signed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [ethers.getAddress(patientWallet), doctorAddress, commitment, cid, transactionHash, category, description.trim() || null,
        versionNumber, previousTransactionHash || null, previousTransactionHash ? changeReason.trim() : null, signature, doctorAddress]
    );
    const [patients] = await db.query("SELECT id FROM users WHERE role='patient' AND LOWER(wallet_address)=LOWER(?) LIMIT 1", [patientWallet]);
    if (patients[0]) await notify(patients[0].id, "record_uploaded", "Rekam medis baru", "Dokter mengunggah rekam medis baru untuk Anda.");
    await logAuditEvent({ actorUserId: req.user.id, actorWallet: doctorAddress, doctorUserId: req.user.id, doctorWallet: doctorAddress, patientUserId: patients[0]?.id, patientWallet: ethers.getAddress(patientWallet), eventType: previousTransactionHash ? "record_versioned" : "record_uploaded", description: previousTransactionHash ? `Dokter membuat versi ${versionNumber} dan menambahkan alasan revisi` : "Dokter mengunggah rekam medis dan menandatanganinya secara digital", transactionHash });
    return res.status(201).json({ message: "Metadata file rekam medis tersimpan.", cid, transactionHash });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ message: "Metadata transaksi ini sudah tersimpan." });
    console.error("Save medical record metadata error:", error.message);
    return res.status(500).json({ message: "Gagal menyimpan metadata rekam medis." });
  }
}

async function getPatientRecordFiles(req, res) {
  try {
    const [users] = await db.query(
      "SELECT wallet_address FROM users WHERE id = ? AND role = 'patient' LIMIT 1",
      [req.user.id]
    );
    const patientWallet = users[0]?.wallet_address;
    if (!patientWallet) return res.status(409).json({ message: "Hubungkan wallet pasien terlebih dahulu." });
    await ensureMedicalRecordFilesTable();
    await ensureRecordDeletionRequestsTable();
    await ensureAiTables();
    const [records] = await db.query(
      `SELECT m.id, m.doctor_wallet, m.commitment, m.cid, m.transaction_hash,
              m.category, m.description, m.version_number, m.previous_transaction_hash,
              m.change_reason, m.signature, m.signed_by, m.signed_at, m.created_at, u.full_name AS doctor_name,
              e.results AS extracted_results, e.reviewed_at AS extraction_reviewed_at
       FROM medical_record_files m
       LEFT JOIN users u ON LOWER(u.wallet_address) = LOWER(m.doctor_wallet) AND u.role = 'doctor'
       LEFT JOIN medical_document_extractions e ON e.transaction_hash = m.transaction_hash
       WHERE m.patient_wallet = ? ORDER BY m.created_at DESC`,
      [patientWallet]
    );
    const events = await medicalRecordContract.queryFilter(
      medicalRecordContract.filters.RecordAdded(patientWallet),
      0,
      "latest"
    );
    events.sort((left, right) =>
      left.blockNumber - right.blockNumber ||
      left.transactionIndex - right.transactionIndex ||
      left.index - right.index
    );
    const recordIndexByTransaction = new Map(
      events.map((event, index) => [event.transactionHash.toLowerCase(), index])
    );
    const [doctorUsers] = await db.query(
      `SELECT wallet_address, full_name FROM users
       WHERE role = 'doctor' AND wallet_address IS NOT NULL`
    );
    const doctorNames = new Map(
      doctorUsers.map((doctor) => [doctor.wallet_address.toLowerCase(), doctor.full_name])
    );
    const [approvedRequests] = await db.query(
      `SELECT transaction_hash FROM record_deletion_requests
       WHERE patient_wallet = ? AND status = 'approved'`,
      [patientWallet]
    );
    const approvedTransactions = new Set(
      approvedRequests.map((request) => request.transaction_hash.toLowerCase())
    );
    const metadataByTransaction = new Map(records.map((record) => [record.transaction_hash.toLowerCase(), record]));
    for (const record of records) {
      record.signature_verified = false;
      if (!record.signature || !record.signed_by) continue;
      const previous = record.previous_transaction_hash ? metadataByTransaction.get(record.previous_transaction_hash.toLowerCase()) : null;
      if (record.previous_transaction_hash && !previous) continue;
      const message = [
        "MediChain Record Signature",
        `Contract:${medicalRecordContract.target.toLowerCase()}`,
        "ChainId:31337",
        `Patient:${patientWallet.toLowerCase()}`,
        `Doctor:${record.doctor_wallet.toLowerCase()}`,
        `Commitment:${record.commitment.toLowerCase()}`,
        `Transaction:${record.transaction_hash.toLowerCase()}`,
        `Previous:${previous?.commitment.toLowerCase() || "none"}`,
      ].join("\n");
      try { record.signature_verified = ethers.verifyMessage(message, record.signature).toLowerCase() === record.signed_by.toLowerCase() && record.signed_by.toLowerCase() === record.doctor_wallet.toLowerCase(); }
      catch { record.signature_verified = false; }
    }
    const revokedTransactions = new Set();
    for (const event of events) {
      if (await medicalRecordContract.revokedCommitments(patientWallet, event.args.commitment)) revokedTransactions.add(event.transactionHash.toLowerCase());
    }
    // Do not surface metadata left in MySQL after a local Hardhat chain reset.
    // Keep an old metadata row only if its commitment is still known by this deployment.
    const currentChainRecords = [];
    for (const record of records) {
      const transactionKey = record.transaction_hash.toLowerCase();
      const presentInEvents = recordIndexByTransaction.has(transactionKey);
      const knownByContract = presentInEvents || (typeof medicalRecordContract.knownCommitments === "function"
        ? await medicalRecordContract.knownCommitments(patientWallet, record.commitment).catch(() => false)
        : false);
      if (knownByContract) currentChainRecords.push(record);
    }
    return res.json({
      records: currentChainRecords
        .filter((record) => !approvedTransactions.has(record.transaction_hash.toLowerCase()) && !revokedTransactions.has(record.transaction_hash.toLowerCase()))
        .map((record) => ({
          ...record,
          extracted_results: typeof record.extracted_results === "string" ? JSON.parse(record.extracted_results) : (record.extracted_results || []),
          record_index: recordIndexByTransaction.get(record.transaction_hash.toLowerCase()) ?? null,
        })),
      chain_records: events.map((event, recordIndex) => ({
        record_index: recordIndex,
        transaction_hash: event.transactionHash,
        doctor_wallet: event.args.doctor,
        doctor_name: doctorNames.get(event.args.doctor.toLowerCase()) || "Dokter tidak diketahui",
        commitment: event.args.commitment,
        timestamp: Number(event.args.timestamp),
        block_number: event.blockNumber,
      })),
      revoked_transactions: [...revokedTransactions],
    });
  } catch (error) {
    console.error("Get patient record files error:", error.message);
    return res.status(500).json({ message: "Gagal mengambil metadata rekam medis." });
  }
}

module.exports = { uploadEncryptedFile, saveRecordMetadata, getPatientRecordFiles };
