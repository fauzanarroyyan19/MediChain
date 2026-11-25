
const db = require("../config/database");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { ensureAuthVersionColumn } = require("../services/authVersionService");

async function ensurePasswordResetTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_reset_user (user_id),
    INDEX idx_password_reset_expiry (expires_at)
  )`);
}

function getMailTransport() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === "true",
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

async function forgotPassword(req, res) {
  const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Masukkan alamat email yang valid." });
  }

  const transporter = getMailTransport();
  if (!transporter) {
    return res.status(503).json({ message: "Pengiriman email belum dikonfigurasi. Isi SMTP_HOST, SMTP_USER, dan SMTP_PASS di backend/.env." });
  }

  try {
    await ensurePasswordResetTable();
    const [users] = await db.query(
      "SELECT id, full_name, email FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    // Keep the response identical for existing and unknown email addresses.
    if (users.length) {
      const user = users[0];
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      await db.query(
        "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
        [user.id]
      );
      await db.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 15 MINUTE))`,
        [user.id, tokenHash]
      );

      const frontendUrl = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, "");
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: user.email,
          subject: "Atur ulang password MediChain",
          text: `Halo ${user.full_name}, buka tautan ini dalam 15 menit untuk membuat password baru: ${resetUrl}\n\nJika Anda tidak meminta reset, abaikan email ini.`,
          html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:24px auto;color:#172b2a"><h2>Atur ulang password MediChain</h2><p>Halo ${escapeHtml(user.full_name)},</p><p>Gunakan tombol di bawah untuk membuat password baru. Tautan hanya berlaku selama 15 menit dan hanya dapat digunakan sekali.</p><p style="margin:28px 0"><a href="${resetUrl}" style="background:#115e59;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Atur password baru</a></p><p>Jika Anda tidak meminta reset password, abaikan email ini.</p></div>`,
        });
      } catch (mailError) {
        console.error("Password reset email delivery failed:", mailError.message);
        await db.query(
          "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE token_hash = ?",
          [tokenHash]
        );
      }
    }

    return res.json({ message: "Jika email terdaftar, tautan untuk mengatur ulang password akan dikirim." });
  } catch (error) {
    console.error("Forgot password error:", error.message);
    return res.status(500).json({ message: "Permintaan reset password belum dapat diproses. Coba lagi nanti." });
  }
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/i.test(token)) {
    return res.status(400).json({ message: "Tautan reset tidak valid atau sudah kedaluwarsa." });
  }
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ message: "Password baru harus minimal 8 karakter dan maksimal 72 byte." });
  }

  let connection;
  try {
    await ensureAuthVersionColumn();
    await ensurePasswordResetTable();
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const passwordHash = await bcrypt.hash(password, 12);
    connection = await db.getConnection();
    await connection.beginTransaction();
    const [tokens] = await connection.query(
      `SELECT id, user_id FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > UTC_TIMESTAMP()
       LIMIT 1 FOR UPDATE`,
      [tokenHash]
    );
    if (!tokens.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru." });
    }

    const reset = tokens[0];
    await connection.query("UPDATE users SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ?", [passwordHash, reset.user_id]);
    await connection.query(
      "UPDATE password_reset_tokens SET used_at = UTC_TIMESTAMP() WHERE user_id = ? AND used_at IS NULL",
      [reset.user_id]
    );
    await connection.commit();
    return res.json({ message: "Password berhasil diperbarui. Silakan masuk dengan password baru." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Reset password error:", error.message);
    return res.status(500).json({ message: "Password belum dapat diperbarui. Coba lagi nanti." });
  } finally {
    connection?.release();
  }
}

async function register(req, res) {
  try {
    await ensureAuthVersionColumn();
    const { full_name, email, password, role } = req.body;

    if (!full_name || !email || !password || !role) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    if (!["patient", "doctor"].includes(role)) {
      return res.status(400).json({
        message: "Invalid role"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const [existingUsers] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "Email already registered"
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [result] = await db.query(
      `INSERT INTO users
       (full_name, email, password_hash, role)
       VALUES (?, ?, ?, ?)`,
      [full_name, email, passwordHash, role]
    );

    res.status(201).json({
      message: "Registration successful",
      user: {
        id: result.insertId,
        full_name,
        email,
        role
      }
    });
  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      message: "Registration failed"
    });
  }
}

async function login(req, res) {
  try {
    await ensureAuthVersionColumn();
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    const [users] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const user = users[0];

    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        auth_version: Number(user.auth_version || 0),
      },
      process.env.JWT_SECRET,
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "1d"
      }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        wallet_address: user.wallet_address
      }
    });
  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      message: "Login failed"
    });
  }
}

module.exports = {
  register,
  login,
  forgotPassword,
  resetPassword,
};
