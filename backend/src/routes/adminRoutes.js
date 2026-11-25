
const express = require("express");
const router = express.Router();

const {
  getDoctors,
  getAdminDashboardOverview,
} = require("../controllers/adminController");
const {
  getAdminDeletionRequests,
  reviewDeletionRequest,
} = require("../controllers/recordDeletionController");
const { getAuditTrail } = require("../controllers/auditController");
const { getEmergencyAccessRequests, reviewEmergencyAccess, revokeEmergencyAccessRequest, reportDoctorVerification } = require("../controllers/securityController");

const {
  authenticateToken,
  authorizeRole,
} = require("../middleware/authMiddleware");

router.get(
  "/doctors",
  authenticateToken,
  authorizeRole("admin"),
  getDoctors
);

router.get(
  "/overview",
  authenticateToken,
  authorizeRole("admin"),
  getAdminDashboardOverview
);

router.get(
  "/record-deletion-requests",
  authenticateToken,
  authorizeRole("admin"),
  getAdminDeletionRequests
);

router.patch(
  "/record-deletion-requests/:id",
  authenticateToken,
  authorizeRole("admin"),
  reviewDeletionRequest
);

router.get("/audit-trail", authenticateToken, authorizeRole("admin"), getAuditTrail);
router.get("/emergency-access-requests", authenticateToken, authorizeRole("admin"), getEmergencyAccessRequests);
router.patch("/emergency-access-requests/:id", authenticateToken, authorizeRole("admin"), reviewEmergencyAccess);
router.patch("/emergency-access-requests/:id/revoke", authenticateToken, authorizeRole("admin"), revokeEmergencyAccessRequest);
router.post("/doctors/:doctorId/verification-notification", authenticateToken, authorizeRole("admin"), reportDoctorVerification);

module.exports = router;
