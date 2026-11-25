const db = require("../config/database");

let schemaReady;

async function ensureAuthVersionColumn() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const [columns] = await db.query("SHOW COLUMNS FROM users LIKE 'auth_version'");
      if (!columns.length) {
        await db.query("ALTER TABLE users ADD COLUMN auth_version INT UNSIGNED NOT NULL DEFAULT 0");
      }
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

module.exports = { ensureAuthVersionColumn };
