
const jwt = require("jsonwebtoken");
const db = require("../config/database");
const { ensureAuthVersionColumn } = require("../services/authVersionService");

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Access token required"
    });
  }

  const token = authHeader.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  try {
    await ensureAuthVersionColumn();
    const [users] = await db.query("SELECT auth_version FROM users WHERE id = ? LIMIT 1", [decoded.id]);
    if (!users.length || Number(users[0].auth_version) !== Number(decoded.auth_version || 0)) {
      return res.status(401).json({ message: "Sesi telah berakhir atau password berubah. Silakan login kembali." });
    }
  } catch (error) {
    console.error("Authenticate token database error:", error.message);
    return res.status(503).json({ message: "Layanan autentikasi sementara tidak tersedia." });
  }

  req.user = decoded;
  return next();
}

function authorizeRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission"
      });
    }

    next();
  };
}

module.exports = {
  authenticateToken,
  authorizeRole
};
