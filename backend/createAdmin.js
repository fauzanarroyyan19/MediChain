
require("dotenv").config();

const db = require("./src/config/database");
const bcrypt = require("bcryptjs");

async function createAdmin() {
  try {
    const fullName = "MediChain Administrator";
    const email = "admin@medichain.com";
    const password = "Admin12345";

    const [existing] = await db.query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (existing.length > 0) {
      console.log("Admin account already exists.");
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await db.query(
      `INSERT INTO users
       (full_name, email, password_hash, role)
       VALUES (?, ?, ?, 'admin')`,
      [fullName, email, passwordHash]
    );

    console.log("Admin account created successfully!");
    console.log("Email:", email);
    console.log("Password:", password);
  } catch (error) {
    console.error("Failed to create admin:", error.message);
  } finally {
    await db.end();
  }
}

createAdmin();
