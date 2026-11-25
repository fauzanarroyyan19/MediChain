const db = require("../config/database");
const {
  getPatientsWithDoctorAccess,
  getDoctorRecordStats,
} = require("../services/blockchainService");

async function getAuthorizedPatients(req, res) {
  try {
    const [doctors] = await db.query(
      `SELECT wallet_address FROM users
       WHERE id = ? AND role = 'doctor' LIMIT 1`,
      [req.user.id]
    );

    const doctorAddress = doctors[0]?.wallet_address;
    if (!doctorAddress) {
      return res.status(409).json({
        message: "Hubungkan wallet dokter terlebih dahulu.",
      });
    }

    const result = await getPatientsWithDoctorAccess(doctorAddress);
    if (!result.verified) {
      return res.status(403).json({
        message: "Wallet dokter belum terdaftar dan terverifikasi di blockchain.",
        patients: [],
      });
    }

    return res.status(200).json({
      message: "Authorized patients retrieved successfully",
      total: result.patients.length,
      patients: result.patients,
    });
  } catch (error) {
    console.error("Get authorized patients error:", error.message);
    return res.status(503).json({
      message: "Unable to retrieve patient permissions from the blockchain",
    });
  }
}

async function getDoctorDashboardOverview(req, res) {
  try {
    const [doctors] = await db.query(
      "SELECT wallet_address FROM users WHERE id = ? AND role = 'doctor' LIMIT 1",
      [req.user.id]
    );
    const doctorAddress = doctors[0]?.wallet_address;
    if (!doctorAddress) {
      return res.status(200).json({ verified: false, authorizedPatients: 0, recordsCreated: 0, recordsLast30Days: 0 });
    }

    const [permissions, recordStats] = await Promise.all([
      getPatientsWithDoctorAccess(doctorAddress),
      getDoctorRecordStats(doctorAddress),
    ]);
    return res.json({
      verified: permissions.verified,
      authorizedPatients: permissions.patients.length,
      ...recordStats,
    });
  } catch (error) {
    console.error("Get doctor dashboard overview error:", error.message);
    return res.status(503).json({ message: "Gagal mengambil ringkasan dashboard dokter dari blockchain." });
  }
}

module.exports = { getAuthorizedPatients, getDoctorDashboardOverview };
