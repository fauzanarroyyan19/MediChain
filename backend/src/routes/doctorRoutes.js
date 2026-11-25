const express = require("express");
const router = express.Router();
const {
  getAuthorizedPatients,
  getDoctorDashboardOverview,
} = require("../controllers/doctorController");
const { authenticateToken, authorizeRole } = require("../middleware/authMiddleware");
const {
  uploadEncryptedFile,
  saveRecordMetadata,
} = require("../controllers/medicalRecordController");
const {
  listDoctorAppointments,
  decideAppointment,
  rescheduleAppointment,
  completeAppointment,
} = require("../controllers/appointmentController");
const { requestEmergencyAccess, getEmergencyPatientCandidates, reportDoctorRegistration, getDoctorPatientRecords, getVersionableRecords } = require("../controllers/securityController");
const { createDoctorRevocationRequest } = require("../controllers/recordDeletionController");
const ai = require("../controllers/aiController");

router.post("/ai/scan", authenticateToken, authorizeRole("doctor"), express.raw({ type: "application/octet-stream", limit: "15mb" }), ai.scanDocument);
router.post("/ai/extractions", authenticateToken, authorizeRole("doctor"), ai.saveReviewedExtraction);
router.get("/ai/summary/:patientId", authenticateToken, authorizeRole("doctor"), ai.doctorSummary);

router.post("/emergency-access-requests", authenticateToken, authorizeRole("doctor"), requestEmergencyAccess);
router.get("/emergency-patient-candidates", authenticateToken, authorizeRole("doctor"), getEmergencyPatientCandidates);
router.post("/registration-notification", authenticateToken, authorizeRole("doctor"), reportDoctorRegistration);
router.post("/record-revocation-requests", authenticateToken, authorizeRole("doctor"), createDoctorRevocationRequest);
router.get("/patients/:patientId/records", authenticateToken, authorizeRole("doctor"), getDoctorPatientRecords);
router.get("/record-versions", authenticateToken, authorizeRole("doctor"), getVersionableRecords);

router.post(
  "/records/upload",
  authenticateToken,
  authorizeRole("doctor"),
  express.raw({ type: "application/octet-stream", limit: "13mb" }),
  uploadEncryptedFile
);

router.post(
  "/records",
  authenticateToken,
  authorizeRole("doctor"),
  saveRecordMetadata
);

router.get(
  "/patients",
  authenticateToken,
  authorizeRole("doctor"),
  getAuthorizedPatients
);

router.get(
  "/overview",
  authenticateToken,
  authorizeRole("doctor"),
  getDoctorDashboardOverview
);

router.get(
  "/appointments",
  authenticateToken,
  authorizeRole("doctor"),
  listDoctorAppointments
);

router.patch(
  "/appointments/:id/decision",
  authenticateToken,
  authorizeRole("doctor"),
  decideAppointment
);

router.patch(
  "/appointments/:id/reschedule",
  authenticateToken,
  authorizeRole("doctor"),
  rescheduleAppointment
);

router.patch(
  "/appointments/:id/complete",
  authenticateToken,
  authorizeRole("doctor"),
  completeAppointment
);

module.exports = router;
