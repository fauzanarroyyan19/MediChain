const db = require("../config/database");

let tableReady;

async function ensureAuditLogsTable() {
  if (!tableReady) {
    tableReady = db.query(`CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      actor_user_id BIGINT UNSIGNED NULL,
      actor_wallet VARCHAR(42) NULL,
      patient_user_id BIGINT UNSIGNED NULL,
      patient_wallet VARCHAR(42) NULL,
      doctor_user_id BIGINT UNSIGNED NULL,
      doctor_wallet VARCHAR(42) NULL,
      event_type VARCHAR(64) NOT NULL,
      description VARCHAR(500) NOT NULL,
      transaction_hash CHAR(66) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_audit_created (created_at),
      INDEX idx_audit_type (event_type),
      INDEX idx_audit_patient (patient_user_id),
      INDEX idx_audit_doctor (doctor_user_id)
    )`).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  await tableReady;
}

async function logAuditEvent(event) {
  await ensureAuditLogsTable();
  await db.query(
    `INSERT INTO audit_logs
     (actor_user_id, actor_wallet, patient_user_id, patient_wallet,
      doctor_user_id, doctor_wallet, event_type, description, transaction_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.actorUserId || null, event.actorWallet || null,
      event.patientUserId || null, event.patientWallet || null,
      event.doctorUserId || null, event.doctorWallet || null,
      event.eventType, String(event.description || event.eventType).slice(0, 500),
      event.transactionHash || null]
  );
}

module.exports = { ensureAuditLogsTable, logAuditEvent };
