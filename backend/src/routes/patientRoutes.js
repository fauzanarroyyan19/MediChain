const express = require("express");
const router = express.Router();
const { getVerifiedDoctors } = require("../controllers/patientController");
const { authenticateToken, authorizeRole } = require("../middleware/authMiddleware");
const { getPatientRecordFiles } = require("../controllers/medicalRecordController");
const {
  createPatientDeletionRequest,
  getPatientDeletionRequests,
} = require("../controllers/recordDeletionController");
const {
  getAvailableDoctors,
  createAppointment,
  listPatientAppointments,
  cancelPatientAppointment,
  requestReschedule,
} = require("../controllers/appointmentController");

router.get(
  "/doctors",
  authenticateToken,
  authorizeRole("patient"),
  getVerifiedDoctors
);

router.get(
  "/records",
  authenticateToken,
  authorizeRole("patient"),
  getPatientRecordFiles
);

router.get(
  "/record-deletion-requests",
  authenticateToken,
  authorizeRole("patient"),
  getPatientDeletionRequests
);

router.post(
  "/record-deletion-requests",
  authenticateToken,
  authorizeRole("patient"),
  createPatientDeletionRequest
);

router.get(
  "/appointment-doctors",
  authenticateToken,
  authorizeRole("patient"),
  getAvailableDoctors
);

router.get(
  "/appointments",
  authenticateToken,
  authorizeRole("patient"),
  listPatientAppointments
);

router.post(
  "/appointments",
  authenticateToken,
  authorizeRole("patient"),
  createAppointment
);

router.patch(
  "/appointments/:id/cancel",
  authenticateToken,
  authorizeRole("patient"),
  cancelPatientAppointment
);

router.post(
  "/appointments/:id/reschedule-request",
  authenticateToken,
  authorizeRole("patient"),
  requestReschedule
);

module.exports = router;
