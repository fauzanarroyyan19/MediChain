
const { ethers } = require("ethers");
const db = require("../config/database");

const artifact = require("../../../blockchain/artifacts/contracts/MedicalRecord.sol/MedicalRecord.json");

const provider = new ethers.JsonRpcProvider(
  process.env.BLOCKCHAIN_RPC_URL
);

const contractAddress =
  process.env.MEDICAL_RECORD_CONTRACT_ADDRESS;

const medicalRecordContract = new ethers.Contract(
  contractAddress,
  artifact.abi,
  provider
);

async function getBlockchainStatus() {
  const network = await provider.getNetwork();

  const code = await provider.getCode(contractAddress);

  if (code === "0x") {
    throw new Error("Smart contract not found on this network");
  }

  return {
    connected: true,
    network: "Hardhat Local Network",
    chainId: network.chainId.toString(),
    contractAddress
  };
}

async function isDoctorVerified(address) {
  if (!ethers.isAddress(address)) return false;
  const doctor = await medicalRecordContract.doctors(address);
  return doctor.registered && doctor.verified;
}

async function getPatientsWithDoctorAccess(doctorAddress) {
  const doctor = await medicalRecordContract.doctors(doctorAddress);
  if (!doctor.registered || !doctor.verified) {
    return { verified: false, patients: [] };
  }

  // Enumerate only patients who have a linked wallet, then validate each
  // permission against the contract instead of trusting frontend state.
  const [rows] = await db.query(
    `SELECT id, full_name, email, wallet_address
     FROM users
     WHERE role = 'patient' AND wallet_address IS NOT NULL
     ORDER BY full_name ASC`
  );
  const patients = (await Promise.all(
    rows.map(async (patient) => ({
      ...patient,
      hasAccess: await medicalRecordContract.accessPermissions(
        patient.wallet_address,
        doctorAddress
      ),
    }))
  )).filter((patient) => patient.hasAccess);

  return { verified: true, patients };
}

async function getDoctorRecordStats(doctorAddress) {
  const events = await medicalRecordContract.queryFilter(
    medicalRecordContract.filters.RecordAdded(null, doctorAddress),
    0,
    "latest"
  );
  const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  return {
    recordsCreated: events.length,
    recordsLast30Days: events.filter((event) => Number(event.args.timestamp) >= cutoff).length,
  };
}

async function getDoctorAddressForUser(userId) {
  const [rows] = await db.query(
    "SELECT wallet_address FROM users WHERE id = ? AND role = 'doctor' LIMIT 1",
    [userId]
  );
  return rows[0]?.wallet_address || null;
}

async function ensureMedicalRecordFilesTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS medical_record_files (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_wallet VARCHAR(42) NOT NULL,
    doctor_wallet VARCHAR(42) NOT NULL,
    commitment CHAR(66) NOT NULL,
    cid VARCHAR(255) NOT NULL,
    transaction_hash CHAR(66) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'Other',
    description TEXT NULL,
    version_number INT UNSIGNED NOT NULL DEFAULT 1,
    previous_transaction_hash CHAR(66) NULL,
    change_reason VARCHAR(1000) NULL,
    signature TEXT NULL,
    signed_by VARCHAR(42) NULL,
    signed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_record_transaction (transaction_hash),
    INDEX idx_patient_wallet (patient_wallet),
    INDEX idx_doctor_wallet (doctor_wallet)
  )`);
  const [columns] = await db.query("SHOW COLUMNS FROM medical_record_files");
  const columnNames = new Set(columns.map((column) => column.Field));
  if (!columnNames.has("category")) {
    await db.query("ALTER TABLE medical_record_files ADD COLUMN category VARCHAR(40) NOT NULL DEFAULT 'Other'");
  }
  if (!columnNames.has("description")) {
    await db.query("ALTER TABLE medical_record_files ADD COLUMN description TEXT NULL");
  }
  const securityColumns = [
    ["version_number", "INT UNSIGNED NOT NULL DEFAULT 1"],
    ["previous_transaction_hash", "CHAR(66) NULL"],
    ["change_reason", "VARCHAR(1000) NULL"],
    ["signature", "TEXT NULL"],
    ["signed_by", "VARCHAR(42) NULL"],
    ["signed_at", "TIMESTAMP NULL"],
  ];
  for (const [name, definition] of securityColumns) {
    if (!columnNames.has(name)) await db.query(`ALTER TABLE medical_record_files ADD COLUMN ${name} ${definition}`);
  }
}

async function ensureRecordDeletionRequestsTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS record_deletion_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT UNSIGNED NOT NULL,
    requester_user_id BIGINT UNSIGNED NULL,
    requester_role VARCHAR(20) NOT NULL DEFAULT 'patient',
    patient_wallet VARCHAR(42) NOT NULL,
    transaction_hash CHAR(66) NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    review_note VARCHAR(1000) NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    INDEX idx_deletion_status (status),
    INDEX idx_deletion_patient (patient_id),
    INDEX idx_deletion_transaction (transaction_hash)
  )`);
  const [columns] = await db.query("SHOW COLUMNS FROM record_deletion_requests");
  if (!columns.some((column) => column.Field === "requester_user_id")) await db.query("ALTER TABLE record_deletion_requests ADD COLUMN requester_user_id BIGINT UNSIGNED NULL");
  if (!columns.some((column) => column.Field === "requester_role")) await db.query("ALTER TABLE record_deletion_requests ADD COLUMN requester_role VARCHAR(20) NOT NULL DEFAULT 'patient'");
  if (!columns.some((column) => column.Field === "revocation_transaction_hash")) {
    await db.query("ALTER TABLE record_deletion_requests ADD COLUMN revocation_transaction_hash CHAR(66) NULL");
  }
}

module.exports = {
  medicalRecordContract,
  getBlockchainStatus,
  isDoctorVerified,
  getPatientsWithDoctorAccess,
  getDoctorRecordStats,
  getDoctorAddressForUser,
  ensureMedicalRecordFilesTable,
  ensureRecordDeletionRequestsTable
};
