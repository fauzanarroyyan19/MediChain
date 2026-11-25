const db = require("../config/database");
const { isDoctorVerified } = require("../services/blockchainService");

async function getVerifiedDoctors(req, res) {
  try {
    const [doctors] = await db.query(
      `SELECT id, full_name, email, wallet_address
       FROM users
       WHERE role = 'doctor' AND wallet_address IS NOT NULL
       ORDER BY full_name ASC`
    );

    const verifiedDoctors = (await Promise.all(
      doctors.map(async (doctor) => ({
        ...doctor,
        verified: await isDoctorVerified(doctor.wallet_address),
      }))
    )).filter((doctor) => doctor.verified);

    res.status(200).json({
      message: "Verified doctors retrieved successfully",
      total: verifiedDoctors.length,
      doctors: verifiedDoctors,
    });
  } catch (error) {
    console.error("Get verified doctors error:", error.message);
    res.status(503).json({
      message: "Unable to retrieve verified doctors from the blockchain",
    });
  }
}

module.exports = { getVerifiedDoctors };
