
const db = require("../config/database");
const { medicalRecordContract } = require("../services/blockchainService");

async function getDoctors(req, res) {
  try {
    const [doctors] = await db.query(
      `SELECT
        id,
        full_name,
        email,
        wallet_address,
        created_at
       FROM users
       WHERE role = 'doctor'
       ORDER BY created_at DESC`
    );

    res.status(200).json({
      message: "Doctor list retrieved successfully",
      total: doctors.length,
      doctors,
    });
  } catch (error) {
    console.error("Get doctors error:", error.message);

    res.status(500).json({
      message: "Failed to retrieve doctor list",
    });
  }
}

async function getAdminDashboardOverview(req, res) {
  try {
    const [[userCounts], [doctorRows]] = await Promise.all([
      db.query("SELECT role, COUNT(*) AS total FROM users GROUP BY role"),
      db.query("SELECT wallet_address FROM users WHERE role = 'doctor' AND wallet_address IS NOT NULL"),
    ]);
    const userCountByRole = Object.fromEntries(
      userCounts.map((row) => [row.role, Number(row.total)])
    );
    const doctorStatuses = await Promise.all(
      doctorRows.map(async ({ wallet_address }) => {
        const status = await medicalRecordContract.doctors(wallet_address);
        return { registered: status.registered, verified: status.verified };
      })
    );
    return res.json({
      totalUsers: Object.values(userCountByRole).reduce((sum, count) => sum + count, 0),
      totalPatients: userCountByRole.patient || 0,
      totalDoctors: doctorRows.length,
      registeredDoctors: doctorStatuses.filter((status) => status.registered).length,
      verifiedDoctors: doctorStatuses.filter((status) => status.registered && status.verified).length,
    });
  } catch (error) {
    console.error("Get admin dashboard overview error:", error.message);
    return res.status(503).json({ message: "Gagal mengambil statistik dari database atau blockchain." });
  }
}

module.exports = { getDoctors, getAdminDashboardOverview };
