const db = require("../config/database");
const { ethers } = require("ethers");
const { medicalRecordContract } = require("../services/blockchainService");
const { ensureAuditLogsTable } = require("../services/auditService");

const CHAIN_EVENTS = ["RecordAdded", "RecordVersioned", "RecordRevoked", "AccessGranted", "AccessGrantedUntil", "AccessRevoked", "EmergencyAccessGranted", "EmergencyAccessRevoked", "DoctorRegistered", "DoctorVerified"];
const EVENT_LABELS = {
  RecordAdded: "record_uploaded",
  RecordVersioned: "record_versioned",
  RecordRevoked: "record_revoked",
  AccessGranted: "access_granted",
  AccessGrantedUntil: "access_granted",
  AccessRevoked: "access_revoked",
  EmergencyAccessGranted: "emergency_access_granted",
  EmergencyAccessRevoked: "emergency_access_revoked",
  DoctorRegistered: "doctor_registered",
  DoctorVerified: "doctor_verified",
};

function validDate(value) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getAuditTrail(req, res) {
  try {
    const { startDate = "", endDate = "", type = "", patient = "", doctor = "" } = req.query;
    if (!validDate(startDate) || !validDate(endDate)) return res.status(400).json({ message: "Format tanggal harus YYYY-MM-DD." });
    if (patient && !ethers.isAddress(patient)) return res.status(400).json({ message: "Wallet pasien tidak valid." });
    if (doctor && !ethers.isAddress(doctor)) return res.status(400).json({ message: "Wallet dokter tidak valid." });

    await ensureAuditLogsTable();
    const [users] = await db.query("SELECT id, full_name, role, wallet_address FROM users WHERE wallet_address IS NOT NULL");
    const names = new Map(users.map((user) => [user.wallet_address.toLowerCase(), { name: user.full_name, role: user.role, id: user.id }]));
    const logs = [];

    const filter = async (eventName) => medicalRecordContract.queryFilter(medicalRecordContract.filters[eventName](), 0, "latest");
    const chainResults = [];
    for (const name of CHAIN_EVENTS) chainResults.push(await filter(name));
    const temporaryGrantTransactions = new Set(chainResults[4].map((event) => event.transactionHash.toLowerCase()));
    const chainEvents = chainResults.flat();
    const blockNumbers = [...new Set(chainEvents.map((event) => event.blockNumber))];
    const blocks = new Map();
    for (let offset = 0; offset < blockNumbers.length; offset += 5) {
      const batch = blockNumbers.slice(offset, offset + 5);
      const batchBlocks = await Promise.all(batch.map((number) => medicalRecordContract.runner.provider.getBlock(number)));
      batch.forEach((number, index) => blocks.set(number, batchBlocks[index]));
    }
    for (const event of chainEvents) {
      const name = event.fragment.name;
      if (name === "AccessGranted" && temporaryGrantTransactions.has(event.transactionHash.toLowerCase())) return;
      const args = event.args;
      let patientWallet = null;
      let doctorWallet = null;
      let actorWallet = null;
      let description = "";
      if (name === "RecordAdded") {
        patientWallet = args.patient; doctorWallet = args.doctor; actorWallet = doctorWallet;
        description = `Dokter mengunggah rekam medis (commitment ${args.commitment})`;
      } else if (name === "RecordVersioned") {
        patientWallet = args.patient; doctorWallet = args.doctor; actorWallet = doctorWallet;
        description = `Dokter membuat versi ${args.version} dari commitment ${args.previousCommitment}`;
      } else if (name === "RecordRevoked") {
        patientWallet = args.patient; actorWallet = args.revokedBy;
        description = `Record ${args.commitment} dinonaktifkan`;
      } else if (name === "AccessGranted" || name === "AccessGrantedUntil") {
        patientWallet = args.patient; doctorWallet = args.doctor; actorWallet = patientWallet;
        description = name === "AccessGrantedUntil" ? `Izin akses sementara diberikan hingga ${new Date(Number(args.expiresAt) * 1000).toISOString()}` : "Izin akses dokter diberikan";
      } else if (name === "AccessRevoked") {
        patientWallet = args.patient; doctorWallet = args.doctor; actorWallet = patientWallet; description = "Izin akses dokter dicabut";
      } else if (name === "EmergencyAccessGranted") {
        patientWallet = args.patient; doctorWallet = args.doctor;
        const tx = await medicalRecordContract.runner.provider.getTransaction(event.transactionHash);
        actorWallet = tx?.from || null;
        description = `Akses darurat berlaku sampai ${new Date(Number(args.expiresAt) * 1000).toISOString()} (alasan disimpan sebagai hash)`;
      } else if (name === "EmergencyAccessRevoked") {
        patientWallet = args.patient; doctorWallet = args.doctor; actorWallet = args.revokedBy;
        description = args.revokedBy.toLowerCase() === args.patient.toLowerCase() ? "Akses darurat dicabut oleh pasien" : "Akses darurat dicabut oleh admin";
      } else {
        doctorWallet = args.doctor; actorWallet = doctorWallet;
        description = name === "DoctorVerified" ? "Dokter diverifikasi di blockchain" : "Dokter terdaftar di blockchain";
      }
      const block = blocks.get(event.blockNumber);
      logs.push({
        id: `chain-${event.transactionHash}-${event.index}`,
        eventType: EVENT_LABELS[name], source: "blockchain", description,
        timestamp: new Date(Number(args.timestamp ?? block.timestamp) * 1000).toISOString(),
        blockNumber: event.blockNumber,
        actorWallet, actorName: names.get((actorWallet || "").toLowerCase())?.name || "Wallet tidak terhubung",
        actorRole: names.get((actorWallet || "").toLowerCase())?.role || "wallet",
        patientWallet, doctorWallet,
        transactionHash: event.transactionHash,
      });
    }

    const clauses = [];
    const values = [];
    if (startDate) { clauses.push("created_at >= ?"); values.push(`${startDate} 00:00:00`); }
    if (endDate) { clauses.push("created_at < DATE_ADD(?, INTERVAL 1 DAY)"); values.push(`${endDate} 00:00:00`); }
    if (type) { clauses.push("event_type = ?"); values.push(type); }
    if (patient) { clauses.push("LOWER(patient_wallet) = LOWER(?)"); values.push(patient); }
    if (doctor) { clauses.push("LOWER(doctor_wallet) = LOWER(?)"); values.push(doctor); }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [appLogs] = await db.query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT 500`, values);
    appLogs.forEach((row) => {
      if (row.transaction_hash && logs.some((log) => log.transactionHash?.toLowerCase() === row.transaction_hash.toLowerCase())) return;
      const actor = row.actor_wallet && names.get(row.actor_wallet.toLowerCase());
      const createdAt = row.created_at instanceof Date ? row.created_at : new Date(`${row.created_at}Z`);
      logs.push({
        id: `app-${row.id}`, eventType: row.event_type, source: "application", description: row.description,
        timestamp: createdAt.toISOString(), actorWallet: row.actor_wallet,
        actorName: actor?.name || "Pengguna", actorRole: actor?.role || "user",
        patientWallet: row.patient_wallet, doctorWallet: row.doctor_wallet,
        transactionHash: row.transaction_hash,
      });
    });

    const filtered = logs.filter((log) => {
      if (type && log.eventType !== type) return false;
      if (patient && log.patientWallet?.toLowerCase() !== patient.toLowerCase()) return false;
      if (doctor && log.doctorWallet?.toLowerCase() !== doctor.toLowerCase()) return false;
      const day = log.timestamp.slice(0, 10);
      return (!startDate || day >= startDate) && (!endDate || day <= endDate);
    }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500);
    return res.json({ logs: filtered, count: filtered.length });
  } catch (error) {
    console.error("Audit trail error:", error.message);
    return res.status(503).json({ message: "Gagal memuat Audit Trail. Periksa koneksi database dan blockchain." });
  }
}

module.exports = { getAuditTrail };
