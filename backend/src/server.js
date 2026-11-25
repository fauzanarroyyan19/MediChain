
require('dotenv').config()
const { getBlockchainStatus } = require("./services/blockchainService");
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')
const db = require('./config/database')
const authRoutes = require("./routes/authRoutes");
const app = express()
const walletRoutes = require("./routes/walletRoutes");
const adminRoutes = require("./routes/adminRoutes");
const patientRoutes = require("./routes/patientRoutes");
const doctorRoutes = require("./routes/doctorRoutes");
const healthFeatureRoutes = require("./routes/healthFeatureRoutes");
// Middleware
app.use(helmet())

app.use(cors({
  origin: process.env.FRONTEND_URL
}))

app.use(express.json({ limit: '1mb' }))

const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.API_RATE_LIMIT_MAX) || 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    message: "Terlalu banyak permintaan dalam waktu singkat. Tunggu beberapa menit lalu coba lagi.",
  }),
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    message: "Terlalu banyak percobaan autentikasi. Tunggu sebelum mencoba kembali.",
  }),
});

app.use(apiRateLimit);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to MediChain API',
    status: 'running'
  })
})

// Database health check
app.get('/api/health', async (req, res) => {
  try {
    await db.query('SELECT 1')

    res.json({
      status: 'OK',
      database: 'Connected'
    })
  } catch (error) {
    console.error('Database Error:', error.message)

    res.status(500).json({
      status: 'ERROR',
      database: 'Disconnected'
    })
  }
})

// Start server
const PORT = process.env.PORT || 5000
app.get("/api/blockchain/status", async (req, res) => {
  try {
    const status = await getBlockchainStatus();

    res.json({
      status: "OK",
      message: "Blockchain connected successfully",
      blockchain: status
    });
  } catch (error) {
    console.error("Blockchain Error:", error.message);

    res.status(500).json({
      status: "ERROR",
      message: error.message
    });
  }
});
app.use("/api/auth", authRateLimit, authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/patient", patientRoutes);
app.use("/api/doctor", doctorRoutes);
app.use("/api", healthFeatureRoutes);
app.listen(PORT, () => {
  console.log(`MediChain API running on port ${PORT}`)
})
