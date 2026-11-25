const db = require("../config/database");
const { medicalRecordContract } = require("../services/blockchainService");
const { notify } = require("./healthFeatureController");

const DURATION_MINUTES = 30;
const ACTIVE_STATUSES = ["Pending", "Accepted", "Rescheduled"];

async function ensureAppointmentsTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS appointments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id BIGINT UNSIGNED NOT NULL,
    doctor_id BIGINT UNSIGNED NOT NULL,
    start_at DATETIME NOT NULL,
    duration_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 30,
    complaint VARCHAR(2000) NOT NULL,
    status ENUM('Pending','Accepted','Rejected','Rescheduled','Cancelled','Completed') NOT NULL DEFAULT 'Pending',
    rejection_reason VARCHAR(1000) NULL,
    reschedule_requested_at DATETIME NULL,
    reschedule_reason VARCHAR(1000) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_appointment_doctor_start (doctor_id, start_at),
    INDEX idx_appointment_patient (patient_id)
  )`);
}

function toSqlUtc(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function appointmentSelect(whereSql) {
  return `SELECT a.id, a.patient_id, a.doctor_id,
          DATE_FORMAT(a.start_at, '%Y-%m-%dT%H:%i:%sZ') AS start_at,
          a.duration_minutes, a.complaint, a.status, a.rejection_reason,
          DATE_FORMAT(a.reschedule_requested_at, '%Y-%m-%dT%H:%i:%sZ') AS reschedule_requested_at,
          a.reschedule_reason, a.created_at, a.updated_at,
          p.full_name AS patient_name, p.email AS patient_email,
          d.full_name AS doctor_name
          FROM appointments a
          JOIN users p ON p.id = a.patient_id
          JOIN users d ON d.id = a.doctor_id ${whereSql}`;
}

async function hasDoctorConflict(connection, doctorId, startAt, excludeId = null) {
  const [conflicts] = await connection.query(
    `SELECT id FROM appointments
     WHERE doctor_id = ?
       AND status IN ('Pending','Accepted','Rescheduled')
       AND start_at < DATE_ADD(?, INTERVAL ${DURATION_MINUTES} MINUTE)
       AND DATE_ADD(start_at, INTERVAL duration_minutes MINUTE) > ?
       AND (? IS NULL OR id != ?)
     LIMIT 1 FOR UPDATE`,
    [doctorId, startAt, startAt, excludeId, excludeId]
  );
  return conflicts.length > 0;
}

async function getAvailableDoctors(req, res) {
  try {
    const [doctors] = await db.query(
      `SELECT id, full_name, email, wallet_address
       FROM users WHERE role = 'doctor' AND wallet_address IS NOT NULL
       ORDER BY full_name ASC`
    );
    const available = [];
    for (const doctor of doctors) {
      const status = await medicalRecordContract.doctors(doctor.wallet_address);
      if (status.registered && status.verified) available.push(doctor);
    }
    return res.json({ doctors: available });
  } catch (error) {
    console.error("Get appointment doctors error:", error.message);
    return res.status(503).json({ message: "Gagal mengambil daftar dokter terverifikasi." });
  }
}

async function createAppointment(req, res) {
  const startAt = toSqlUtc(req.body.startAt);
  const doctorId = Number(req.body.doctorId);
  const complaint = typeof req.body.complaint === "string" ? req.body.complaint.trim() : "";
  if (!Number.isSafeInteger(doctorId) || doctorId < 1 || !startAt || new Date(`${startAt.replace(" ", "T")}Z`) <= new Date()) {
    return res.status(400).json({ message: "Dokter atau waktu appointment tidak valid. Pilih waktu di masa depan." });
  }
  if (complaint.length < 3 || complaint.length > 2000) {
    return res.status(400).json({ message: "Keluhan harus berisi 3 sampai 2000 karakter." });
  }

  let connection;
  try {
    await ensureAppointmentsTable();
    const [patients] = await db.query("SELECT id FROM users WHERE id = ? AND role = 'patient'", [req.user.id]);
    const [doctors] = await db.query("SELECT id, wallet_address FROM users WHERE id = ? AND role = 'doctor'", [doctorId]);
    if (!patients.length || !doctors.length || !doctors[0].wallet_address) {
      return res.status(404).json({ message: "Pasien atau dokter tidak ditemukan." });
    }
    const doctorStatus = await medicalRecordContract.doctors(doctors[0].wallet_address);
    if (!doctorStatus.registered || !doctorStatus.verified) {
      return res.status(409).json({ message: "Appointment hanya dapat dibuat dengan dokter terverifikasi." });
    }

    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [doctorId]);
    if (await hasDoctorConflict(connection, doctorId, startAt)) {
      await connection.rollback();
      return res.status(409).json({ message: "Jadwal dokter bentrok. Pilih waktu lain." });
    }
    const [result] = await connection.query(
      `INSERT INTO appointments (patient_id, doctor_id, start_at, duration_minutes, complaint)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, doctorId, startAt, DURATION_MINUTES, complaint]
    );
    await connection.commit();
    await notify(doctorId,"appointment_new","Appointment baru","Pasien mengirim permintaan konsultasi baru.",Number(result.insertId));
    return res.status(201).json({ message: "Appointment berhasil diajukan.", id: result.insertId, status: "Pending" });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Create appointment error:", error.message);
    return res.status(500).json({ message: "Gagal membuat appointment." });
  } finally {
    connection?.release();
  }
}

async function listPatientAppointments(req, res) {
  try {
    await ensureAppointmentsTable();
    const [appointments] = await db.query(
      `${appointmentSelect("WHERE a.patient_id = ? ORDER BY a.start_at DESC")}`,
      [req.user.id]
    );
    return res.json({ appointments });
  } catch (error) {
    console.error("List patient appointments error:", error.message);
    return res.status(500).json({ message: "Gagal mengambil appointment." });
  }
}

async function cancelPatientAppointment(req, res) {
  try {
    await ensureAppointmentsTable();
    const [rows] = await db.query("SELECT id,doctor_id FROM appointments WHERE id=? AND patient_id=? AND status IN ('Pending','Accepted','Rescheduled') AND start_at>UTC_TIMESTAMP()",[req.params.id,req.user.id]);
    if(!rows.length){const [existing]=await db.query("SELECT id FROM appointments WHERE id=? AND patient_id=?",[req.params.id,req.user.id]);return existing.length?res.status(409).json({message:"Appointment sudah dimulai atau tidak dapat dibatalkan."}):res.status(404).json({message:"Appointment tidak ditemukan."});}
    await db.query("UPDATE appointments SET status='Cancelled' WHERE id=? AND patient_id=? AND status IN ('Pending','Accepted','Rescheduled') AND start_at>UTC_TIMESTAMP()",[req.params.id,req.user.id]);
    await notify(rows[0].doctor_id,"appointment_cancelled","Appointment dibatalkan","Pasien membatalkan appointment.",Number(req.params.id));
    return res.json({ message: "Appointment dibatalkan.", status: "Cancelled" });
  } catch (error) {
    console.error("Cancel appointment error:", error.message);
    return res.status(500).json({ message: "Gagal membatalkan appointment." });
  }
}

async function requestReschedule(req, res) {
  const requestedAt = toSqlUtc(req.body.requestedAt);
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  if (!requestedAt || new Date(`${requestedAt.replace(" ", "T")}Z`) <= new Date() || reason.length < 3 || reason.length > 1000) {
    return res.status(400).json({ message: "Waktu baru harus di masa depan dan alasan berisi 3 sampai 1000 karakter." });
  }
  try {
    await ensureAppointmentsTable();
    const [rows] = await db.query(
      "SELECT id, status, start_at FROM appointments WHERE id = ? AND patient_id = ? LIMIT 1",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Appointment tidak ditemukan." });
    if (!["Accepted", "Rescheduled"].includes(rows[0].status) || new Date(rows[0].start_at) <= new Date()) {
      return res.status(409).json({ message: "Penjadwalan ulang hanya bisa diajukan untuk appointment yang akan datang dan sudah diterima." });
    }
    await db.query(
      `UPDATE appointments SET reschedule_requested_at = ?, reschedule_reason = ?
       WHERE id = ? AND patient_id = ?`,
      [requestedAt, reason, req.params.id, req.user.id]
    );
    const [appointmentOwners]=await db.query("SELECT doctor_id FROM appointments WHERE id=?",[req.params.id]);
    await notify(appointmentOwners[0].doctor_id,"appointment_reschedule_requested","Permintaan ubah jadwal","Pasien meminta penjadwalan ulang appointment.",Number(req.params.id));
    return res.json({ message: "Permintaan penjadwalan ulang dikirim ke dokter." });
  } catch (error) {
    console.error("Request reschedule error:", error.message);
    return res.status(500).json({ message: "Gagal mengajukan penjadwalan ulang." });
  }
}

async function listDoctorAppointments(req, res) {
  try {
    await ensureAppointmentsTable();
    const { date } = req.query;
    const conditions = ["a.doctor_id = ?"];
    const params = [req.user.id];
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      conditions.push("DATE(a.start_at) = ?");
      params.push(date);
    }
    const [appointments] = await db.query(
      appointmentSelect(`WHERE ${conditions.join(" AND ")} ORDER BY a.start_at ASC`),
      params
    );
    return res.json({ appointments });
  } catch (error) {
    console.error("List doctor appointments error:", error.message);
    return res.status(500).json({ message: "Gagal mengambil jadwal dokter." });
  }
}

async function decideAppointment(req, res) {
  const { decision, rejectionReason = "" } = req.body;
  if (!["Accepted", "Rejected"].includes(decision)) return res.status(400).json({ message: "Keputusan tidak valid." });
  if (decision === "Rejected" && (typeof rejectionReason !== "string" || rejectionReason.trim().length < 3 || rejectionReason.length > 1000)) {
    return res.status(400).json({ message: "Alasan penolakan harus berisi 3 sampai 1000 karakter." });
  }
  try {
    await ensureAppointmentsTable();
    const [rows] = await db.query(
      "SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ? LIMIT 1",
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Appointment tidak ditemukan." });
    if (rows[0].status !== "Pending") return res.status(409).json({ message: "Hanya appointment pending yang dapat diputuskan." });
    await db.query(
      "UPDATE appointments SET status = ?, rejection_reason = ? WHERE id = ? AND doctor_id = ? AND status = 'Pending'",
      [decision, decision === "Rejected" ? rejectionReason.trim() : null, req.params.id, req.user.id]
    );
    const [appointmentOwners]=await db.query("SELECT patient_id FROM appointments WHERE id=?",[req.params.id]);
    await notify(appointmentOwners[0].patient_id,decision==="Accepted"?"appointment_accepted":"appointment_rejected",decision==="Accepted"?"Appointment diterima":"Appointment ditolak",decision==="Accepted"?"Dokter menerima appointment Anda.":`Dokter menolak appointment: ${rejectionReason.trim()}`,Number(req.params.id));
    return res.json({ message: `Appointment ${decision.toLowerCase()}.`, status: decision });
  } catch (error) {
    console.error("Decide appointment error:", error.message);
    return res.status(500).json({ message: "Gagal memperbarui appointment." });
  }
}

async function rescheduleAppointment(req, res) {
  const startAt = toSqlUtc(req.body.startAt);
  if (!startAt || new Date(`${startAt.replace(" ", "T")}Z`) <= new Date()) {
    return res.status(400).json({ message: "Jadwal baru harus berada di masa depan." });
  }
  let connection;
  try {
    await ensureAppointmentsTable();
    connection = await db.getConnection();
    await connection.beginTransaction();
    await connection.query("SELECT id FROM users WHERE id = ? FOR UPDATE", [req.user.id]);
    const [rows] = await connection.query(
      "SELECT id, status FROM appointments WHERE id = ? AND doctor_id = ? FOR UPDATE",
      [req.params.id, req.user.id]
    );
    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ message: "Appointment tidak ditemukan." });
    }
    const appointment = rows[0];
    if (!["Accepted", "Rescheduled"].includes(appointment.status)) {
      await connection.rollback();
      return res.status(409).json({ message: "Hanya appointment yang diterima dapat dijadwalkan ulang." });
    }
    if (await hasDoctorConflict(connection, req.user.id, startAt, Number(req.params.id))) {
      await connection.rollback();
      return res.status(409).json({ message: "Jadwal dokter bentrok. Pilih waktu lain." });
    }
    await connection.query(
      `UPDATE appointments SET start_at = ?, status = 'Rescheduled',
       reschedule_requested_at = NULL, reschedule_reason = NULL WHERE id = ?`,
      [startAt, req.params.id]
    );
    await connection.commit();
    const [appointmentOwners]=await db.query("SELECT patient_id FROM appointments WHERE id=?",[req.params.id]);
    await notify(appointmentOwners[0].patient_id,"appointment_rescheduled","Jadwal konsultasi diperbarui","Dokter mengubah jadwal konsultasi Anda.",Number(req.params.id));
    return res.json({ message: "Appointment dijadwalkan ulang.", status: "Rescheduled" });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Reschedule appointment error:", error.message);
    return res.status(500).json({ message: "Gagal menjadwalkan ulang appointment." });
  } finally {
    connection?.release();
  }
}

async function completeAppointment(req, res) {
  try {
    await ensureAppointmentsTable();
    const [result] = await db.query(
      `UPDATE appointments SET status = 'Completed'
       WHERE id = ? AND doctor_id = ? AND status IN ('Accepted','Rescheduled') AND start_at <= UTC_TIMESTAMP()`,
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(409).json({ message: "Appointment belum waktunya selesai atau statusnya tidak dapat diselesaikan." });
    return res.json({ message: "Appointment ditandai selesai.", status: "Completed" });
  } catch (error) {
    console.error("Complete appointment error:", error.message);
    return res.status(500).json({ message: "Gagal menyelesaikan appointment." });
  }
}

module.exports = {
  getAvailableDoctors,
  createAppointment,
  listPatientAppointments,
  cancelPatientAppointment,
  requestReschedule,
  listDoctorAppointments,
  decideAppointment,
  rescheduleAppointment,
  completeAppointment,
  ensureAppointmentsTable,
};
