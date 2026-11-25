const express = require("express");
const router = express.Router();
const {
  authenticateToken,
  authorizeRole
} = require("../middleware/authMiddleware");
const {
  register,
  login,
  forgotPassword,
  resetPassword,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);

router.get("/me", authenticateToken, (req, res) => {
  res.json({
    message: "Authenticated successfully",
    user: req.user
  });
});

// Khusus pasien
router.get(
  "/patient/dashboard",
  authenticateToken,
  authorizeRole("patient"),
  (req, res) => {
    res.json({
      message: "Welcome to Patient Dashboard",
      role: req.user.role
    });
  }
);

// Khusus dokter
router.get(
  "/doctor/dashboard",
  authenticateToken,
  authorizeRole("doctor"),
  (req, res) => {
    res.json({
      message: "Welcome to Doctor Dashboard",
      role: req.user.role
    });
  }
);

// Khusus admin
router.get(
  "/admin/dashboard",
  authenticateToken,
  authorizeRole("admin"),
  (req, res) => {
    res.json({
      message: "Welcome to Admin Dashboard",
      role: req.user.role
    });
  }
);
module.exports = router;
