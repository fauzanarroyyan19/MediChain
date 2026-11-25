
const { ethers } = require("ethers");
const crypto = require("crypto");
const db = require("../config/database");

// Membuat pesan verifikasi wallet
async function createWalletChallenge(req, res) {
  try {
    const userId = req.user.id;
    const nonce = crypto.randomBytes(32).toString("hex");

    // Hapus challenge lama milik pengguna
    await db.query(
      "DELETE FROM wallet_challenges WHERE user_id = ?",
      [userId]
    );

    // Challenge berlaku selama 5 menit
    await db.query(
      `INSERT INTO wallet_challenges (user_id, nonce, expires_at)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
      [userId, nonce]
    );

    const message =
      `MediChain Wallet Verification\n` +
      `User ID: ${userId}\n` +
      `Nonce: ${nonce}`;

    res.json({
      message: "Wallet challenge created",
      signingMessage: message,
    });
  } catch (error) {
    console.error("Create wallet challenge error:", error.message);
    res.status(500).json({ message: "Failed to create wallet challenge" });
  }
}

// Memverifikasi signature dan menyimpan wallet
async function verifyWallet(req, res) {
  try {
    const userId = req.user.id;
    const { address, signature } = req.body;

    if (!address || !signature) {
      return res.status(400).json({
        message: "Wallet address and signature are required",
      });
    }

    let normalizedAddress;

    try {
      normalizedAddress = ethers.getAddress(address);
    } catch {
      return res.status(400).json({
        message: "Invalid wallet address",
      });
    }

    const [challenges] = await db.query(
      `SELECT nonce FROM wallet_challenges
       WHERE user_id = ? AND expires_at > NOW()
       ORDER BY id DESC LIMIT 1`,
      [userId]
    );

    if (challenges.length === 0) {
      return res.status(400).json({
        message: "Challenge not found or expired. Please try again.",
      });
    }

    const nonce = challenges[0].nonce;

    const message =
      `MediChain Wallet Verification\n` +
      `User ID: ${userId}\n` +
      `Nonce: ${nonce}`;

    let recoveredAddress;

    try {
      recoveredAddress = ethers.verifyMessage(message, signature);
    } catch {
      return res.status(400).json({
        message: "Invalid wallet signature",
      });
    }

    if (recoveredAddress.toLowerCase() !== normalizedAddress.toLowerCase()) {
      return res.status(401).json({
        message: "Signature does not match wallet address",
      });
    }

    const [existing] = await db.query(
      "SELECT id FROM users WHERE wallet_address = ? AND id != ?",
      [normalizedAddress, userId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        message: "This wallet is already linked to another account",
      });
    }

    await db.query(
      "UPDATE users SET wallet_address = ? WHERE id = ?",
      [normalizedAddress, userId]
    );

    await db.query(
      "DELETE FROM wallet_challenges WHERE user_id = ?",
      [userId]
    );

    res.json({
      message: "Wallet linked successfully",
      wallet_address: normalizedAddress,
    });
  } catch (error) {
    console.error("Verify wallet error:", error.message);
    res.status(500).json({ message: "Wallet verification failed" });
  }
}

module.exports = {
  createWalletChallenge,
  verifyWallet,
};
