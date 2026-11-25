
const express = require("express");
const router = express.Router();

const {
  createWalletChallenge,
  verifyWallet,
} = require("../controllers/walletController");

const { authenticateToken } = require("../middleware/authMiddleware");

router.post("/challenge", authenticateToken, createWalletChallenge);
router.post("/verify", authenticateToken, verifyWallet);

module.exports = router;
