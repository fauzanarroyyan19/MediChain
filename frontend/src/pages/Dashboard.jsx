import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Users,
  FileText,
  ShieldCheck,
  Stethoscope,
  Clock,
  Wallet,
  LogOut,
  LayoutDashboard,
  UserRound,
  ClipboardList,
  FlaskConical,
  Pill,
  CalendarDays,
  Bell,
  HeartPulse,
  QrCode,
  BadgeCheck,
  History,
  Sparkles,
} from "lucide-react";

import { linkWallet } from "../services/wallet";
import api from "../services/api";
import AdvancedFeatures from "../components/AdvancedFeatures";
import AuditTrail from "../components/AuditTrail";
import EmergencyAccessPanel from "../components/EmergencyAccessPanel";
import AIWorkspace from "../components/AIWorkspace";
import {
  registerDoctorOnBlockchain,
  getDoctorBlockchainStatus,
  verifyDoctorOnBlockchain,
  getPatientDoctorAccessDetails,
  grantDoctorAccess,
  revokeDoctorAccess,
  hashMedicalRecordFile,
  addMedicalRecord,
  getPatientMedicalRecords,
  encryptMedicalRecordFile,
  decryptMedicalRecordFile,
  addMedicalRecordVersion,
  signMedicalRecord,
  revokeRecordOnBlockchain,
} from "../services/blockchain";
import { useAuth } from "../context/AuthContext";

const MEDICAL_RECORD_CATEGORIES = [
  "Consultation",
  "Laboratory Result",
  "Prescription",
  "Diagnosis",
  "Other",
];

const getRecordCategoryIcon = (category) => {
  if (category === "Consultation") return Stethoscope;
  if (category === "Laboratory Result") return FlaskConical;
  if (category === "Prescription") return Pill;
  if (category === "Diagnosis") return Activity;
  return FileText;
};

const toLocalDateTimeInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const todayDateInput = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const dashboardConfig = {
  patient: {
    title: "Patient Dashboard",
    subtitle: "Manage your medical records securely.",
    icon: UserRound,
    stats: [
      { label: "Medical Records", value: "0", icon: FileText },
      { label: "Authorized Doctors", value: "0", icon: Stethoscope },
      { label: "Records Last 30 Days", value: "0", icon: Clock },
    ],
    sectionTitle: "My Medical Records",
    sectionDescription:
      "Your medical records will appear here once they are added to MediChain.",
  },
  doctor: {
    title: "Doctor Dashboard",
    subtitle: "Manage patient access and medical records.",
    icon: Stethoscope,
    stats: [
      { label: "Authorized Patients", value: "0", icon: Users },
      { label: "Records Created", value: "0", icon: FileText },
      { label: "Records Last 30 Days", value: "0", icon: Clock },
    ],
    sectionTitle: "Patient Overview",
    sectionDescription:
      "Patients who grant you access will appear here.",
  },
  admin: {
    title: "Admin Dashboard",
    subtitle: "Monitor and manage the MediChain platform.",
    icon: ShieldCheck,
    stats: [
      { label: "Total Users", value: "0", icon: Users },
      { label: "Registered Doctors", value: "0", icon: Stethoscope },
      { label: "Verified Doctors", value: "0", icon: ShieldCheck },
    ],
    sectionTitle: "System Overview",
    sectionDescription:
      "Platform activity and user management information will appear here.",
  },
};

export default function Dashboard() {
  const { user, logout, updateWallet } = useAuth();
  const navigate = useNavigate();

  const role = String(user?.role || "patient").toLowerCase();
  const config = dashboardConfig[role] || dashboardConfig.patient;
  const RoleIcon = config.icon;
  const [activeSection, setActiveSection] = useState("overview");
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [notificationToast, setNotificationToast] = useState(null);
  const latestNotificationIdRef = useRef(null);
  const notificationToastTimerRef = useRef(null);
  const menuByRole = {
    patient: [
      { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
      { id: "wallet", label: "Wallet", icon: Wallet },
      { id: "access", label: "Akses dokter", icon: Stethoscope },
      { id: "appointments", label: "Janji temu", icon: CalendarDays },
      { id: "records", label: "Timeline rekam medis", icon: FileText },
      { id: "health", label: "Profil kesehatan", icon: HeartPulse },
      { id: "prescriptions", label: "Resep digital", icon: Pill },
      { id: "qr", label: "Bagikan dengan QR", icon: QrCode },
      { id: "ai", label: "AI Health Assistant", icon: Sparkles },
      { id: "notifications", label: "Notifikasi", icon: Bell },
    ],
    doctor: [
      { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
      { id: "wallet", label: "Wallet", icon: Wallet },
      { id: "verification", label: "Verifikasi dokter", icon: BadgeCheck },
      { id: "appointments", label: "Jadwal janji", icon: CalendarDays },
      { id: "patients", label: "Pasien berizin", icon: Users },
      { id: "prescriptions", label: "Resep digital", icon: Pill },
      { id: "health", label: "Profil kesehatan", icon: HeartPulse },
      { id: "qr", label: "Pindai QR", icon: QrCode },
      { id: "ai", label: "AI Scanner & Ringkasan", icon: Sparkles },
      { id: "emergency", label: "Emergency Access", icon: ShieldCheck },
      { id: "notifications", label: "Notifikasi", icon: Bell },
    ],
    admin: [
      { id: "overview", label: "Ringkasan", icon: LayoutDashboard },
      { id: "doctors", label: "Manajemen dokter", icon: BadgeCheck },
      { id: "deletions", label: "Permintaan record", icon: ClipboardList },
      { id: "audit", label: "Audit Trail", icon: History },
      { id: "emergency", label: "Emergency Access", icon: ShieldCheck },
      { id: "notifications", label: "Notifikasi", icon: Bell },
    ],
  };
  const sidebarItems = menuByRole[role] || menuByRole.patient;
  const activeMenuItem = sidebarItems.find((item) => item.id === activeSection) || sidebarItems[0];
  const selectSection = (section) => {
    setActiveSection(section);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    let active = true;
    const refreshUnread = async () => {
      try {
        const response = await api.get("/notifications");
        const items = response.data?.notifications || [];
        if (active) {
          setUnreadNotificationCount(Number(response.data?.unread || 0));
          const newest = items[0];
          if (newest && latestNotificationIdRef.current !== null && Number(newest.id) > latestNotificationIdRef.current && !newest.read_at) {
            setNotificationToast(newest);
            clearTimeout(notificationToastTimerRef.current);
            notificationToastTimerRef.current = setTimeout(() => setNotificationToast(null), 8000);
          }
          if (newest) latestNotificationIdRef.current = Number(newest.id);
        }
      } catch {
        if (active) setUnreadNotificationCount(0);
      }
    };
    refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    window.addEventListener("focus", refreshUnread);
    return () => { active = false; clearInterval(timer); clearTimeout(notificationToastTimerRef.current); window.removeEventListener("focus", refreshUnread); };
  }, [user?.id]);

  const [walletAddress, setWalletAddress] = useState(
    user?.wallet_address || ""
  );
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");

  const [doctorRegistered, setDoctorRegistered] = useState(false);
  const [doctorVerified, setDoctorVerified] = useState(false);
  const [doctorStatusLoading, setDoctorStatusLoading] = useState(false);
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorError, setDoctorError] = useState("");
  const [doctorSuccess, setDoctorSuccess] = useState("");

  const refreshOwnDoctorStatus = async () => {
    if (!walletAddress) {
      setDoctorRegistered(false);
      setDoctorVerified(false);
      return;
    }

    setDoctorStatusLoading(true);
    setDoctorError("");
    try {
      const status = await getDoctorBlockchainStatus(walletAddress);
      setDoctorRegistered(status.registered);
      setDoctorVerified(status.verified);
    } catch (error) {
      setDoctorError(
        error.reason || error.shortMessage || error.message || "Gagal memeriksa status registrasi blockchain."
      );
    } finally {
      setDoctorStatusLoading(false);
    }
  };

  useEffect(() => {
    if (role === "doctor") refreshOwnDoctorStatus();
  }, [role, walletAddress]);

  // Admin Doctor Management
  const [adminDoctors, setAdminDoctors] = useState([]);
  const [adminDoctorsLoading, setAdminDoctorsLoading] = useState(false);
  const [adminDoctorsError, setAdminDoctorsError] = useState("");
  const [checkingDoctorId, setCheckingDoctorId] = useState(null);
  const [verifyingDoctorId, setVerifyingDoctorId] = useState(null);
  const [adminActionMessage, setAdminActionMessage] = useState("");
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminOverviewError, setAdminOverviewError] = useState("");
  const adminOverviewRequestRef = useRef(null);

  const [verifiedDoctors, setVerifiedDoctors] = useState([]);
  const [patientDoctorsLoading, setPatientDoctorsLoading] = useState(false);
  const [patientDoctorsError, setPatientDoctorsError] = useState("");
  const [patientActionMessage, setPatientActionMessage] = useState("");
  const [accessDurationChoice, setAccessDurationChoice] = useState("24");
  const [customAccessHours, setCustomAccessHours] = useState("48");
  const [patientAccess, setPatientAccess] = useState({});
  const [patientAccessStatus, setPatientAccessStatus] = useState({});
  const [patientAccessExpiry, setPatientAccessExpiry] = useState({});
  const [patientActionWallet, setPatientActionWallet] = useState(null);
  const [authorizedPatients, setAuthorizedPatients] = useState([]);
  const [authorizedPatientsLoading, setAuthorizedPatientsLoading] = useState(false);
  const [authorizedPatientsError, setAuthorizedPatientsError] = useState("");
  const [doctorOverview, setDoctorOverview] = useState(null);
  const [doctorOverviewError, setDoctorOverviewError] = useState("");
  const [recordFiles, setRecordFiles] = useState({});
  const [recordPasswords, setRecordPasswords] = useState({});
  const [recordCategories, setRecordCategories] = useState({});
  const [recordDescriptions, setRecordDescriptions] = useState({});
  const [recordVersionSelections, setRecordVersionSelections] = useState({});
  const [recordVersionOptions, setRecordVersionOptions] = useState({});
  const [recordVersionReasons, setRecordVersionReasons] = useState({});
  const recordFileInputs = useRef({});
  const [recordActions, setRecordActions] = useState({});
  const [recordMessages, setRecordMessages] = useState({});
  const [patientRecords, setPatientRecords] = useState([]);
  const [patientRecordsLoading, setPatientRecordsLoading] = useState(false);
  const [patientRecordsError, setPatientRecordsError] = useState("");
  const [timelineDoctorFilter, setTimelineDoctorFilter] = useState("all");
  const [timelineCategoryFilter, setTimelineCategoryFilter] = useState("all");
  const [timelineStartDate, setTimelineStartDate] = useState("");
  const [timelineEndDate, setTimelineEndDate] = useState("");
  const [expandedRecordIndex, setExpandedRecordIndex] = useState(null);
  const [hiddenPatientRecordCount, setHiddenPatientRecordCount] = useState(0);
  const [patientRecordPasswords, setPatientRecordPasswords] = useState({});
  const [deletionReasons, setDeletionReasons] = useState({});
  const [deletionRequestStatus, setDeletionRequestStatus] = useState({});
  const [deletionRequestErrors, setDeletionRequestErrors] = useState({});
  const [adminDeletionRequests, setAdminDeletionRequests] = useState([]);
  const [adminDeletionLoading, setAdminDeletionLoading] = useState(false);
  const [adminDeletionError, setAdminDeletionError] = useState("");
  const [adminDeletionBusyId, setAdminDeletionBusyId] = useState(null);
  const [adminReviewNotes, setAdminReviewNotes] = useState({});
  const [appointmentDoctors, setAppointmentDoctors] = useState([]);
  const [patientAppointments, setPatientAppointments] = useState([]);
  const [doctorAppointments, setDoctorAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [appointmentsError, setAppointmentsError] = useState("");
  const [appointmentDoctorId, setAppointmentDoctorId] = useState("");
  const [appointmentStartAt, setAppointmentStartAt] = useState("");
  const [appointmentComplaint, setAppointmentComplaint] = useState("");
  const [appointmentBusyId, setAppointmentBusyId] = useState(null);
  const [appointmentSuccess, setAppointmentSuccess] = useState("");
  const [appointmentDateFilter, setAppointmentDateFilter] = useState(todayDateInput());
  const [appointmentRejectionReasons, setAppointmentRejectionReasons] = useState({});
  const [appointmentRescheduleTimes, setAppointmentRescheduleTimes] = useState({});
  const [patientRescheduleTimes, setPatientRescheduleTimes] = useState({});
  const [patientRescheduleReasons, setPatientRescheduleReasons] = useState({});
const fetchOwnMedicalRecords = async () => {
  if (!walletAddress) {
    setPatientRecordsError("Hubungkan wallet pasien terlebih dahulu.");
    return;
  }

  setPatientRecordsLoading(true);
  setPatientRecordsError("");

  try {
    const [chainRecords, metadataResponse, requestResponse] = await Promise.all([
      getPatientMedicalRecords(walletAddress, walletAddress),
      api.get("/patient/records"),
      api.get("/patient/record-deletion-requests"),
    ]);

    const metadata = metadataResponse.data?.records || [];
    const chainTransactions = metadataResponse.data?.chain_records || [];
    const revokedTransactionHashes = new Set((metadataResponse.data?.revoked_transactions || []).map((hash) => hash.toLowerCase()));
    const requests = requestResponse.data?.requests || [];
    setDeletionRequestStatus(requests.reduce((latest, request) => {
      const key = request.transaction_hash.toLowerCase();
      if (!latest[key]) latest[key] = request;
      return latest;
    }, {}));

    const approvedTransactionHashes = new Set(
      requests
        .filter((request) => request.status === "approved")
        .map((request) => request.transaction_hash.toLowerCase())
    );
    const hiddenCount = chainTransactions.filter((item) =>
      approvedTransactionHashes.has(item.transaction_hash.toLowerCase()) || revokedTransactionHashes.has(item.transaction_hash.toLowerCase())
    ).length;
    const hiddenLegacyCount = metadata.filter((item) => item.record_index == null && (approvedTransactionHashes.has(item.transaction_hash.toLowerCase()) || revokedTransactionHashes.has(item.transaction_hash.toLowerCase()))).length;
    setHiddenPatientRecordCount(hiddenCount + hiddenLegacyCount);

    const recordsWithMetadata = chainRecords.map((record) => {
        const chainTransaction = chainTransactions.find(
          (item) => Number(item.record_index) === record.index
        );
        const matchedMetadata = metadata.find(
          (item) => item.record_index != null && Number(item.record_index) === record.index
        );

        return {
          ...record,
          transactionHash: chainTransaction?.transaction_hash || null,
          doctorWallet: chainTransaction?.doctor_wallet || record.uploadedBy,
          doctorName: chainTransaction?.doctor_name || "Dokter tidak diketahui",
          blockNumber: chainTransaction?.block_number || null,
          category: matchedMetadata?.category || "Other",
          description: matchedMetadata?.description || "Deskripsi belum ditambahkan.",
          cid: matchedMetadata?.cid || null,
          versionNumber: Number(matchedMetadata?.version_number || 1),
          previousTransactionHash: matchedMetadata?.previous_transaction_hash || null,
          changeReason: matchedMetadata?.change_reason || null,
          signedBy: matchedMetadata?.signed_by || null,
          signedAt: matchedMetadata?.signed_at || null,
          signatureVerified: Boolean(matchedMetadata?.signature_verified),
          extractedResults: matchedMetadata?.extracted_results || [],
          extractionReviewedAt: matchedMetadata?.extraction_reviewed_at || null,
        };
    });
    const legacyMetadata = metadata.filter((item) => item.record_index == null);
    const legacyRecords = legacyMetadata.map((item, index) => ({
      index: chainRecords.length + index,
      commitment: item.commitment,
      uploadedBy: item.doctor_wallet,
      timestamp: Math.floor(new Date(item.created_at).getTime() / 1000),
      transactionHash: item.transaction_hash,
      doctorWallet: item.doctor_wallet,
      doctorName: item.doctor_name || "Dokter tidak diketahui",
      blockNumber: null,
      category: item.category || "Other",
      description: item.description || "Deskripsi belum ditambahkan.",
      cid: item.cid || null,
      versionNumber: Number(item.version_number || 1),
      previousTransactionHash: item.previous_transaction_hash || null,
      changeReason: item.change_reason || null,
      signedBy: item.signed_by || null,
      signedAt: item.signed_at || null,
      signatureVerified: Boolean(item.signature_verified),
      extractedResults: item.extracted_results || [],
      extractionReviewedAt: item.extraction_reviewed_at || null,
      legacyRecord: true,
    }));
    setPatientRecords([...recordsWithMetadata, ...legacyRecords].filter((record) =>
      !record.transactionHash ||
      (!approvedTransactionHashes.has(record.transactionHash.toLowerCase()) && !revokedTransactionHashes.has(record.transactionHash.toLowerCase()))
    ));
  } catch (error) {
    setPatientRecordsError(
      error.reason ||
        error.shortMessage ||
        error.message ||
        "Gagal membaca rekam medis."
    );
  } finally {
    setPatientRecordsLoading(false);
  }
};

  const fetchPatientAppointments = async () => {
    setAppointmentsLoading(true);
    setAppointmentsError("");
    try {
      const [appointmentResponse, doctorResponse] = await Promise.all([
        api.get("/patient/appointments"),
        api.get("/patient/appointment-doctors"),
      ]);
      setPatientAppointments(appointmentResponse.data?.appointments || []);
      setAppointmentDoctors(doctorResponse.data?.doctors || []);
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal memuat appointment.");
    } finally {
      setAppointmentsLoading(false);
    }
  };

  const fetchDoctorAppointments = async () => {
    setAppointmentsLoading(true);
    setAppointmentsError("");
    try {
      const response = await api.get("/doctor/appointments", {
        params: appointmentDateFilter ? { date: appointmentDateFilter } : {},
      });
      setDoctorAppointments(response.data?.appointments || []);
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal memuat jadwal appointment.");
    } finally {
      setAppointmentsLoading(false);
    }
  };

  const handleCreateAppointment = async (event) => {
    event.preventDefault();
    setAppointmentBusyId("create");
    setAppointmentsError("");
    setAppointmentSuccess("");
    try {
      await api.post("/patient/appointments", {
        doctorId: Number(appointmentDoctorId),
        startAt: new Date(appointmentStartAt).toISOString(),
        complaint: appointmentComplaint,
      });
      setAppointmentSuccess("Permintaan appointment berhasil dikirim ke dokter.");
      setAppointmentStartAt("");
      setAppointmentComplaint("");
      await fetchPatientAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal membuat appointment.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleCancelAppointment = async (appointment) => {
    setAppointmentBusyId(appointment.id);
    setAppointmentsError("");
    try {
      await api.patch(`/patient/appointments/${appointment.id}/cancel`);
      await fetchPatientAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal membatalkan appointment.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleRequestAppointmentReschedule = async (appointment) => {
    setAppointmentBusyId(appointment.id);
    setAppointmentsError("");
    try {
      await api.post(`/patient/appointments/${appointment.id}/reschedule-request`, {
        requestedAt: new Date(patientRescheduleTimes[appointment.id]).toISOString(),
        reason: patientRescheduleReasons[appointment.id] || "",
      });
      setAppointmentSuccess("Permintaan penjadwalan ulang dikirim ke dokter.");
      await fetchPatientAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal mengajukan penjadwalan ulang.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleAppointmentDecision = async (appointment, decision) => {
    setAppointmentBusyId(appointment.id);
    setAppointmentsError("");
    try {
      await api.patch(`/doctor/appointments/${appointment.id}/decision`, {
        decision,
        rejectionReason: appointmentRejectionReasons[appointment.id] || "",
      });
      await fetchDoctorAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal memperbarui appointment.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleDoctorReschedule = async (appointment) => {
    setAppointmentBusyId(appointment.id);
    setAppointmentsError("");
    try {
      const proposedTime = appointmentRescheduleTimes[appointment.id] || toLocalDateTimeInput(appointment.reschedule_requested_at || appointment.start_at);
      await api.patch(`/doctor/appointments/${appointment.id}/reschedule`, {
        startAt: new Date(proposedTime).toISOString(),
      });
      await fetchDoctorAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal menjadwalkan ulang appointment.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleCompleteAppointment = async (appointment) => {
    setAppointmentBusyId(appointment.id);
    setAppointmentsError("");
    try {
      await api.patch(`/doctor/appointments/${appointment.id}/complete`);
      await fetchDoctorAppointments();
    } catch (error) {
      setAppointmentsError(error.response?.data?.message || error.message || "Gagal menyelesaikan appointment.");
    } finally {
      setAppointmentBusyId(null);
    }
  };

  const handleAddMedicalRecord = async (patient) => {
    const file = recordFiles[patient.id];
    setRecordActions((current) => ({ ...current, [patient.id]: true }));
    setRecordMessages((current) => ({ ...current, [patient.id]: "" }));
    try {
      if (!walletAddress) throw new Error("Hubungkan wallet dokter terlebih dahulu.");
      if (!file) throw new Error("Pilih file rekam medis terlebih dahulu.");
      const passphrase = recordPasswords[patient.id] || "";
      const encryptedFile = await encryptMedicalRecordFile(file, passphrase);
      const uploadResponse = await api.post("/doctor/records/upload", encryptedFile, {
        headers: { "Content-Type": "application/octet-stream" },
      });
      const commitment = await hashMedicalRecordFile(file);
      const previousRecord = (recordVersionOptions[patient.id] || []).find((record) => record.transaction_hash === recordVersionSelections[patient.id]);
      const changeReason = recordVersionReasons[patient.id] || "";
      if (previousRecord && changeReason.trim().length < 5) throw new Error("Tuliskan alasan perubahan minimal 5 karakter.");
      const result = previousRecord
        ? await addMedicalRecordVersion(walletAddress, patient.wallet_address, commitment, previousRecord.commitment)
        : await addMedicalRecord(walletAddress, patient.wallet_address, commitment);
      const signedRecord = await signMedicalRecord(patient.wallet_address, commitment, result.transactionHash, previousRecord?.commitment || "");
      await api.post("/doctor/records", {
        patientWallet: patient.wallet_address,
        commitment,
        cid: uploadResponse.data.cid,
        transactionHash: result.transactionHash,
        category: recordCategories[patient.id] || "Other",
        description: recordDescriptions[patient.id] || "",
        previousTransactionHash: previousRecord?.transaction_hash || "",
        changeReason,
        signature: signedRecord.signature,
      });
      setRecordMessages((current) => ({
        ...current,
        [patient.id]: `Versi ${previousRecord ? Number(previousRecord.version_number) + 1 : 1} tersimpan dan ditandatangani wallet dokter. CID: ${uploadResponse.data.cid}. Bagikan passphrase ke pasien melalui jalur aman. Transaction: ${result.transactionHash}`,
      }));
      setRecordFiles((current) => ({ ...current, [patient.id]: null }));
      setRecordPasswords((current) => ({ ...current, [patient.id]: "" }));
      setRecordCategories((current) => ({ ...current, [patient.id]: "Other" }));
      setRecordDescriptions((current) => ({ ...current, [patient.id]: "" }));
      setRecordVersionSelections((current) => ({ ...current, [patient.id]: "" }));
      setRecordVersionReasons((current) => ({ ...current, [patient.id]: "" }));
      setRecordVersionOptions((current) => ({ ...current, [patient.id]: [] }));
      await fetchAuthorizedPatients();
    } catch (error) {
      setRecordMessages((current) => ({
        ...current,
        [patient.id]: error.reason || error.info?.error?.message || error.shortMessage || error.message || "Gagal mencatat rekam medis.",
      }));
    } finally {
      setRecordActions((current) => ({ ...current, [patient.id]: false }));
    }
  };

  const loadRecordVersions = async (patient) => {
    try {
      const { data } = await api.get("/doctor/record-versions", { params: { patientId: patient.id } });
      setRecordVersionOptions((current) => ({ ...current, [patient.id]: data.records || [] }));
    } catch (error) {
      setRecordMessages((current) => ({ ...current, [patient.id]: error.response?.data?.message || "Gagal memuat versi record." }));
    }
  };

  const handleDownloadMedicalRecord = async (record) => {
    setPatientRecordsError("");
    try {
      if (!record.cid) throw new Error("CID file tidak ditemukan. Minta dokter menyimpan ulang metadata.");
      const patientRecordPassword = patientRecordPasswords[record.transactionHash] || "";
      if (!patientRecordPassword) throw new Error("Masukkan passphrase khusus untuk record ini.");
      const gateway = (import.meta.env.VITE_IPFS_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");
      const response = await fetch(`${gateway}${record.cid}`);
      if (!response.ok) throw new Error("Gagal mengambil encrypted file dari IPFS gateway.");
      const decrypted = await decryptMedicalRecordFile(await response.blob(), patientRecordPassword, record.commitment);
      const url = URL.createObjectURL(decrypted.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = decrypted.fileName || `medichain-record-${record.index + 1}`;
      link.click();
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 1000);
    } catch (error) {
      setPatientRecordsError(error.message || "Gagal mengunduh rekam medis.");
    }
  };

  const fetchAdminDoctors = async () => {
    setAdminDoctorsLoading(true);
    setAdminDoctorsError("");
    setAdminActionMessage("");

    try {
      const response = await api.get("/admin/doctors");
      const data = response.data;

      // Mendukung beberapa bentuk response API.
      const doctors = Array.isArray(data)
        ? data
        : Array.isArray(data?.doctors)
          ? data.doctors
          : Array.isArray(data?.data)
            ? data.data
            : [];

      setAdminDoctors(doctors);
    } catch (error) {
      setAdminDoctorsError(
        error.response?.data?.message ||
          error.message ||
          "Gagal mengambil daftar dokter."
      );
    } finally {
      setAdminDoctorsLoading(false);
    }
  };

  const fetchAdminOverview = async () => {
    if (adminOverviewRequestRef.current) return adminOverviewRequestRef.current;
    setAdminOverviewError("");
    const request = api.get("/admin/overview");
    adminOverviewRequestRef.current = request;
    try {
      const response = await request;
      setAdminOverview(response.data);
    } catch (error) {
      setAdminOverviewError(error.response?.data?.message || error.message || "Gagal memuat statistik admin.");
    } finally {
      if (adminOverviewRequestRef.current === request) adminOverviewRequestRef.current = null;
    }
  };

  const fetchDoctorOverview = async () => {
    setDoctorOverviewError("");
    try {
      const response = await api.get("/doctor/overview");
      setDoctorOverview(response.data);
    } catch (error) {
      setDoctorOverviewError(error.response?.data?.message || error.message || "Gagal memuat statistik dokter.");
    }
  };

  const fetchAdminDeletionRequests = async () => {
    setAdminDeletionLoading(true);
    setAdminDeletionError("");
    try {
      const response = await api.get("/admin/record-deletion-requests");
      setAdminDeletionRequests(response.data?.requests || []);
    } catch (error) {
      setAdminDeletionError(error.response?.data?.message || error.message || "Gagal mengambil permintaan.");
    } finally {
      setAdminDeletionLoading(false);
    }
  };

  const handleReviewDeletionRequest = async (request, decision) => {
    setAdminDeletionBusyId(request.id);
    setAdminDeletionError("");
    try {
      let revocationTransactionHash = "";
      if (decision === "approved") {
        if (!walletAddress) throw new Error("Hubungkan wallet admin pemilik kontrak sebelum menyetujui penonaktifan.");
        if (!request.commitment) throw new Error("Commitment record belum dapat diverifikasi dari blockchain.");
        const result = await revokeRecordOnBlockchain(walletAddress, request.patient_wallet, request.commitment, request.reason);
        revocationTransactionHash = result.transactionHash;
      }
      await api.patch(`/admin/record-deletion-requests/${request.id}`, {
        decision,
        reviewNote: adminReviewNotes[request.id] || "",
        revocationTransactionHash,
      });
      await fetchAdminDeletionRequests();
    } catch (error) {
      setAdminDeletionError(error.response?.data?.message || error.message || "Gagal meninjau permintaan.");
    } finally {
      setAdminDeletionBusyId(null);
    }
  };

  const handleCreateDeletionRequest = async (record) => {
    const txHash = record.transactionHash;
    setDeletionRequestErrors((current) => ({ ...current, [txHash]: "" }));
    try {
      await api.post("/patient/record-deletion-requests", {
        transactionHash: txHash,
        reason: deletionReasons[txHash] || "",
      });
      const response = await api.get("/patient/record-deletion-requests");
      const requests = response.data?.requests || [];
      setDeletionRequestStatus(requests.reduce((latest, request) => {
        const key = request.transaction_hash.toLowerCase();
        if (!latest[key]) latest[key] = request;
        return latest;
      }, {}));
      setDeletionReasons((current) => ({ ...current, [txHash]: "" }));
    } catch (error) {
      setDeletionRequestErrors((current) => ({
        ...current,
        [txHash]: error.response?.data?.message || error.message || "Gagal mengajukan permintaan.",
      }));
    }
  };

  useEffect(() => {
    if (role !== "admin") return;
    if (activeSection === "overview") fetchAdminOverview();
    if (activeSection === "doctors") fetchAdminDoctors();
    if (activeSection === "deletions") fetchAdminDeletionRequests();
  }, [role, activeSection]);

  const fetchVerifiedDoctors = async () => {
    setPatientDoctorsLoading(true);
    setPatientDoctorsError("");
    try {
      const response = await api.get("/patient/doctors");
      const doctors = Array.isArray(response.data?.doctors)
        ? response.data.doctors
        : [];
      setVerifiedDoctors(doctors);
      return doctors;
    } catch (error) {
      setPatientDoctorsError(
        error.response?.data?.message || error.message || "Gagal mengambil daftar dokter terverifikasi."
      );
      return [];
    } finally {
      setPatientDoctorsLoading(false);
    }
  };

  const refreshPatientAccess = async (doctors = verifiedDoctors) => {
    if (!walletAddress) return;
    try {
      const statuses = await Promise.all(
        doctors.map(async (doctor) => [doctor.wallet_address.toLowerCase(), await getPatientDoctorAccessDetails(walletAddress, doctor.wallet_address)])
      );
      setPatientAccess(Object.fromEntries(statuses.map(([key, value]) => [key, value.active])));
      setPatientAccessStatus(Object.fromEntries(statuses.map(([key, value]) => [key, value.status])));
      setPatientAccessExpiry(Object.fromEntries(statuses.map(([key, value]) => [key, value.expiresAt])));
    } catch (error) {
      setPatientDoctorsError(
        error.reason || error.shortMessage || error.message || "Gagal membaca status akses dari blockchain."
      );
    }
  };

  useEffect(() => {
    if (role === "patient") fetchVerifiedDoctors();
  }, [role]);

  const fetchAuthorizedPatients = async () => {
    setAuthorizedPatientsLoading(true);
    setAuthorizedPatientsError("");
    try {
      const response = await api.get("/doctor/patients");
      setAuthorizedPatients(Array.isArray(response.data?.patients) ? response.data.patients : []);
    } catch (error) {
      setAuthorizedPatients([]);
      setAuthorizedPatientsError(
        error.response?.data?.message || error.message || "Gagal mengambil daftar pasien yang memberi akses."
      );
    } finally {
      setAuthorizedPatientsLoading(false);
    }
  };

  useEffect(() => {
    if (role === "doctor") {
      fetchAuthorizedPatients();
      fetchDoctorOverview();
    }
  }, [role]);

  useEffect(() => {
    if (role === "patient") fetchPatientAppointments();
  }, [role]);

  useEffect(() => {
    if (role === "doctor") fetchDoctorAppointments();
  }, [role, appointmentDateFilter]);

  useEffect(() => {
    if (role === "patient" && walletAddress && verifiedDoctors.length) {
      refreshPatientAccess();
    }
  }, [role, walletAddress, verifiedDoctors]);

  useEffect(() => {
    if (role === "patient" && walletAddress) fetchOwnMedicalRecords();
  }, [role, walletAddress]);

  const handlePatientAccess = async (doctor, shouldGrant) => {
    const doctorKey = doctor.wallet_address.toLowerCase();
    setPatientActionWallet(doctorKey);
    setPatientDoctorsError("");
    setPatientActionMessage("");
    try {
      if (!walletAddress) throw new Error("Hubungkan wallet pasien terlebih dahulu.");
      const chosenHours = accessDurationChoice === "custom" ? Number(customAccessHours) : Number(accessDurationChoice);
      if (shouldGrant && accessDurationChoice === "custom" && (!Number.isInteger(chosenHours) || chosenHours < 1 || chosenHours > 720)) throw new Error("Durasi custom harus antara 1 sampai 720 jam.");
      const expiresAt = shouldGrant && chosenHours > 0 ? new Date(Date.now() + chosenHours * 3600000).toISOString() : null;
      const result = shouldGrant
        ? await grantDoctorAccess(walletAddress, doctor.wallet_address, expiresAt)
        : await revokeDoctorAccess(walletAddress, doctor.wallet_address);
      await api.post(`/patient/doctor-access/${doctor.id}`, { granted: shouldGrant, transactionHash: result.transactionHash }).catch((notificationError) => {
        console.warn("Could not record access notification:", notificationError.message);
      });
      setPatientAccess((current) => ({ ...current, [doctorKey]: shouldGrant }));
      setPatientActionMessage(
        `${shouldGrant ? "Akses diberikan" : "Akses dicabut"} untuk ${doctor.full_name}. Transaction Hash: ${result.transactionHash}`
      );
    } catch (error) {
      setPatientDoctorsError(
        error.reason ||
          error.info?.error?.message ||
          error.error?.message ||
          error.data?.message ||
          error.shortMessage ||
          error.message ||
          "Transaksi akses gagal."
      );
      // The on-screen permission may be stale if another transaction changed it.
      // Re-read the contract so the next available action matches chain state.
      await refreshPatientAccess();
    } finally {
      setPatientActionWallet(null);
    }
  };

  const handleCheckDoctorStatus = async (doctor) => {
    setCheckingDoctorId(doctor.id);
    setAdminActionMessage("");
    setAdminDoctorsError("");

    try {
      if (!doctor.wallet_address) {
        throw new Error("Dokter belum menghubungkan wallet.");
      }

      const status = await getDoctorBlockchainStatus(doctor.wallet_address);

      setAdminDoctors((currentDoctors) =>
        currentDoctors.map((item) =>
          item.id === doctor.id
            ? {
                ...item,
                blockchain_registered: status.registered,
                blockchain_verified: status.verified,
              }
            : item
        )
      );

      setAdminActionMessage(
        status.registered
          ? status.verified
            ? `Wallet ${doctor.full_name} sudah terdaftar dan terverifikasi di blockchain.`
            : `Wallet ${doctor.full_name} sudah terdaftar, tetapi belum diverifikasi.`
          : `Wallet ${doctor.full_name} belum melakukan registrasi blockchain.`
      );
    } catch (error) {
      setAdminDoctorsError(
        error.reason ||
          error.shortMessage ||
          error.message ||
          "Gagal memeriksa status blockchain."
      );
    } finally {
      setCheckingDoctorId(null);
    }
  };

  const handleVerifyDoctor = async (doctor) => {
    setVerifyingDoctorId(doctor.id);
    setAdminDoctorsError("");
    setAdminActionMessage("");

    try {
      if (!doctor.wallet_address) {
        throw new Error("Dokter belum menghubungkan wallet.");
      }

      const result = await verifyDoctorOnBlockchain(doctor.wallet_address);
      if (result.transactionHash && !result.alreadyVerified) {
        await api.post(`/admin/doctors/${doctor.id}/verification-notification`, { transactionHash: result.transactionHash }).catch((notificationError) => console.warn("Could not notify doctor about verification:", notificationError.message));
      }

      setAdminDoctors((currentDoctors) =>
        currentDoctors.map((item) =>
          item.id === doctor.id
            ? {
                ...item,
                blockchain_registered: true,
                blockchain_verified: true,
              }
            : item
        )
      );

      setAdminActionMessage(
        result.alreadyVerified
          ? `Dokter ${doctor.full_name} sudah terverifikasi sebelumnya.`
          : `Dokter ${doctor.full_name} berhasil diverifikasi. Transaction Hash: ${result.transactionHash}`
      );
      await fetchAdminOverview();
    } catch (error) {
      setAdminDoctorsError(
        error.reason ||
          error.shortMessage ||
          error.message ||
          "Verifikasi dokter gagal."
      );
    } finally {
      setVerifyingDoctorId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleConnectWallet = async () => {
    setWalletLoading(true);
    setWalletError("");
    setDoctorError("");
    setDoctorSuccess("");

    try {
      const address = await linkWallet();
      setWalletAddress(address);
      updateWallet(address);
    } catch (error) {
      setWalletError(
        error.response?.data?.message ||
          error.reason ||
          error.message ||
          "Wallet verification failed."
      );
    } finally {
      setWalletLoading(false);
    }
  };

  const handleRegisterDoctor = async () => {
    setDoctorLoading(true);
    setDoctorError("");
    setDoctorSuccess("");

    try {
      if (!walletAddress) {
        throw new Error("Hubungkan wallet terlebih dahulu.");
      }

      const result = await registerDoctorOnBlockchain(walletAddress);
      if (result.transactionHash && !result.alreadyRegistered) {
        await api.post("/doctor/registration-notification", { transactionHash: result.transactionHash }).catch((notificationError) => console.warn("Could not notify admins about registration:", notificationError.message));
      }
      setDoctorRegistered(true);
      setDoctorVerified(Boolean(result.verified));

      if (result.alreadyRegistered) {
        setDoctorSuccess("Wallet dokter sudah terdaftar di blockchain.");
      } else {
        setDoctorSuccess(
          `Registrasi berhasil! Transaction Hash: ${result.transactionHash}`
        );
      }
    } catch (error) {
      setDoctorError(
        error.reason || error.shortMessage || error.message ||
          "Registrasi dokter gagal."
      );
    } finally {
      setDoctorLoading(false);
    }
  };

  const recentRecordCutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const patientRecentRecords = patientRecords.filter(
    (record) => record.timestamp >= recentRecordCutoff
  ).length;
  const patientAuthorizedDoctorCount = Object.values(patientAccess).filter(Boolean).length;
  const dashboardStats = config.stats.map((stat, index) => {
    let value = "—";
    if (role === "patient") {
      value = patientRecordsLoading
        ? "…"
        : [patientRecords.length, patientAuthorizedDoctorCount, patientRecentRecords][index];
    } else if (role === "doctor") {
      value = index === 0
        ? (authorizedPatientsLoading ? "…" : authorizedPatients.length)
        : doctorOverview
          ? [null, doctorOverview.recordsCreated, doctorOverview.recordsLast30Days][index]
          : "—";
    } else if (role === "admin" && adminOverview) {
      value = [adminOverview.totalUsers, adminOverview.registeredDoctors, adminOverview.verifiedDoctors][index];
    }
    return { ...stat, value };
  });
  const timelineDoctors = Array.from(
    new Map(patientRecords.map((record) => [record.doctorWallet?.toLowerCase(), {
      address: record.doctorWallet,
      name: record.doctorName,
    }])).values()
  ).filter((doctor) => doctor.address);
  const startTimestamp = timelineStartDate
    ? new Date(`${timelineStartDate}T00:00:00`).getTime() / 1000
    : null;
  const endTimestamp = timelineEndDate
    ? new Date(`${timelineEndDate}T23:59:59`).getTime() / 1000
    : null;
  const filteredPatientRecords = patientRecords
    .filter((record) => timelineDoctorFilter === "all" || record.doctorWallet?.toLowerCase() === timelineDoctorFilter)
    .filter((record) => timelineCategoryFilter === "all" || record.category === timelineCategoryFilter)
    .filter((record) => startTimestamp === null || record.timestamp >= startTimestamp)
    .filter((record) => endTimestamp === null || record.timestamp <= endTimestamp)
    .sort((left, right) => right.timestamp - left.timestamp);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[268px] flex-col border-r border-slate-200 bg-white px-4 py-5 md:flex">
        <div className="flex items-center gap-3 px-2 pb-6">
          <div className="rounded-xl bg-teal-700 p-2.5 text-white shadow-sm"><Activity size={22} /></div>
          <div><h1 className="text-lg font-bold tracking-tight text-slate-900">MediChain</h1><p className="text-[11px] text-slate-500">Healthcare workspace</p></div>
        </div>
        <div className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Menu {role}</div>
        <nav aria-label="Navigasi utama" className="flex-1 space-y-1 overflow-y-auto">
          {sidebarItems.map((item) => {
            const ItemIcon = item.icon;
            const selected = activeSection === item.id;
            return <button key={item.id} type="button" onClick={() => selectSection(item.id)} aria-current={selected ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-medium transition ${selected ? "bg-teal-700 text-white shadow-sm shadow-teal-900/15" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"}`}>
              <ItemIcon size={18} strokeWidth={selected ? 2.2 : 1.8}/><span className="flex-1">{item.label}</span>{item.id === "notifications" && unreadNotificationCount > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}{selected&&<span className="h-1.5 w-1.5 rounded-full bg-teal-100"/>}
            </button>;
          })}
        </nav>
        <div className="mt-4 border-t border-slate-100 pt-4">
          <div className="mb-3 flex items-center gap-3 px-2">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-teal-50 text-sm font-bold text-teal-800">{user?.full_name?.slice(0,1)?.toUpperCase()}</div>
            <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{user?.full_name}</p><p className="text-xs capitalize text-slate-500">{role}</p></div>
          </div>
          <button onClick={handleLogout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-700"><LogOut size={17}/>Keluar</button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="md:ml-[268px]">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 md:px-10">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-teal-700">MediChain / {role}</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-900">{activeMenuItem.label}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold">{user?.full_name}</p>
              <p className="text-xs capitalize text-slate-500">{role}</p>
            </div>
            <div className="rounded-full bg-teal-50 p-3 text-teal-800">
              <RoleIcon size={20} />
            </div>
            <button
              onClick={handleLogout}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
              aria-label="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        <nav aria-label="Navigasi fitur" className="sticky top-0 z-20 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2.5 md:hidden">
          {sidebarItems.map((item) => {
            const ItemIcon = item.icon;
            const selected = activeSection === item.id;
            return <button key={item.id} type="button" onClick={() => selectSection(item.id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-600"}`}><ItemIcon size={15}/>{item.label}{item.id === "notifications" && unreadNotificationCount > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] text-white">{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>}</button>;
          })}
        </nav>

        <div id="dashboard-content" className="p-5 md:p-9">
          <section className="mb-7 flex flex-col justify-between gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Workspace / {role}</p><h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{activeMenuItem.label}</h1><p className="mt-1 text-sm text-slate-500">{activeSection === "overview" ? config.subtitle : `Kelola ${activeMenuItem.label.toLowerCase()} MediChain Anda.`}</p></div>
            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${walletAddress ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}><span className={`h-2 w-2 rounded-full ${walletAddress ? "bg-teal-600" : "bg-slate-400"}`}/>{walletAddress ? `Wallet ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}` : "Wallet belum terhubung"}</span>
          </section>

          {/* Stats */}
          <section className={`${activeSection === "overview" ? "" : "hidden"} grid gap-4 sm:grid-cols-2 xl:grid-cols-3`}>
            {dashboardStats.map((stat) => {
              const StatIcon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-lg hover:shadow-teal-950/5 md:p-6"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-500">
                      {stat.label}
                    </p>
                    <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                      <StatIcon size={21} />
                    </div>
                  </div>
                  <p className="mt-5 text-3xl font-bold">{stat.value}</p>
                </div>
              );
            })}
          </section>

          {/* Main Panel */}
          <section id="overview-panel" className={`${activeSection === "overview" ? "" : "hidden"} mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8`}>
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                <ClipboardList size={22} />
              </div>
              <div>
                <h2 className="font-bold">{config.sectionTitle}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  MediChain information
                </p>
              </div>
            </div>

            <div className="mt-6">
              {role === "patient" && (
                patientRecordsLoading ? (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Memuat data record dari blockchain...</p>
                ) : patientRecordsError ? (
                  <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{patientRecordsError}</p>
                ) : patientRecords.length ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Record terbaru pasien</p>
                    {patientRecords.slice().sort((a, b) => b.timestamp - a.timestamp).slice(0, 3).map((record) => (
                      <div key={record.index} className="rounded-xl border border-slate-200 p-4">
                        <p className="font-semibold">Record #{record.index + 1}</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-500">{record.commitment}</p>
                        <p className="mt-2 text-xs text-slate-500">{new Date(record.timestamp * 1000).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Belum ada record aktif yang tercatat untuk wallet pasien ini.</p>
                )
              )}
              {role === "doctor" && (
                doctorOverviewError ? (
                  <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{doctorOverviewError}</p>
                ) : authorizedPatientsLoading ? (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Memuat pasien yang memberi akses...</p>
                ) : authorizedPatients.length ? (
                  <div className="space-y-3">
                    <p className="text-sm text-slate-500">Pasien dengan izin aktif</p>
                    {authorizedPatients.slice(0, 5).map((patient) => (
                      <div key={patient.id} className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                        <span className="font-medium">{patient.full_name}</span>
                        <span className="text-xs text-green-700">Access active</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Belum ada pasien yang memberi akses. Pasien akan muncul setelah grant access terkonfirmasi.</p>
                )
              )}
              {role === "admin" && (
                adminOverviewError ? (
                  <p className="rounded-xl bg-amber-50 p-5 text-sm text-amber-800">{adminOverviewError}</p>
                ) : adminOverview ? (
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="rounded-xl bg-teal-50 p-4"><p className="text-sm text-slate-600">Patients</p><p className="mt-1 text-2xl font-bold">{adminOverview.totalPatients}</p></div>
                    <div className="rounded-xl bg-amber-50 p-4"><p className="text-sm text-slate-600">Doctors pending verification</p><p className="mt-1 text-2xl font-bold">{Math.max(0, adminOverview.registeredDoctors - adminOverview.verifiedDoctors)}</p></div>
                    <div className="rounded-xl bg-green-50 p-4"><p className="text-sm text-slate-600">Verified doctors</p><p className="mt-1 text-2xl font-bold">{adminOverview.verifiedDoctors}</p></div>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Memuat statistik database dan blockchain...</p>
                )
              )}
            </div>
          </section>

          {/* Wallet Connection */}
          <section id="wallet-connection" className={`${activeSection === "wallet" ? "" : "hidden"} mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-7`}>
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                  <Wallet size={22} />
                </div>
                <div>
                  <h3 className="font-semibold">Blockchain Wallet</h3>
                  <p className="text-sm text-slate-500">
                    Connect your MetaMask wallet to MediChain
                  </p>
                </div>
              </div>

            <div className="mt-5 flex gap-3 rounded-xl border border-teal-100 bg-white/80 p-4 text-sm text-teal-950"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-600 font-bold text-white">i</span><p><b>Petunjuk:</b> pilih wallet yang sesuai dengan role akun Anda dan pastikan MetaMask memakai jaringan Hardhat Local (Chain ID 31337). Jangan bagikan seed phrase atau private key.</p></div>

              <button
                onClick={handleConnectWallet}
                disabled={walletLoading}
                className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {walletLoading
                  ? "Connecting..."
                  : walletAddress
                    ? "Reconnect Wallet"
                    : "Connect Wallet"}
              </button>
            </div>

            {walletAddress && (
              <div className="mt-5 rounded-xl bg-green-50 p-4">
                <p className="text-sm font-semibold text-green-700">
                  Wallet successfully connected
                </p>
                <p className="mt-2 break-all font-mono text-sm text-green-800">
                  {walletAddress}
                </p>
              </div>
            )}

            {walletError && (
              <div className="mt-5 break-words rounded-xl bg-red-50 p-4 text-sm text-red-600">
                {walletError}
              </div>
            )}
          </section>

          {/* Patient Access Management */}
          {role === "patient" && (
            <section id="access-management" className={`${activeSection === "access" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                    <Stethoscope size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Doctor Access</h3>
                    <p className="text-sm text-slate-500">
                      Berikan atau cabut izin dokter melalui blockchain.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchVerifiedDoctors}
                  disabled={patientDoctorsLoading}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {patientDoctorsLoading ? "Memuat..." : "Refresh Doctors"}
                </button>
              </div>

              {patientDoctorsError && (
                <div className="mt-5 break-words rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {patientDoctorsError}
                </div>
              )}

              <div className="mt-5 flex gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-950"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sky-600 font-bold text-white">i</span><p><b>Petunjuk akses:</b> hubungkan wallet pasien terlebih dahulu. Tombol “Grant access” atau “Revoke access” akan meminta konfirmasi transaksi di MetaMask; tunggu transaksi selesai sebelum menutup halaman.</p></div>
              <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <label className="text-xs font-semibold text-slate-700">Masa izin akses<select value={accessDurationChoice} onChange={(event) => setAccessDurationChoice(event.target.value)} className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="1">1 jam</option><option value="6">6 jam</option><option value="24">24 jam</option><option value="168">7 hari</option><option value="custom">Custom</option><option value="0">Tanpa kedaluwarsa</option></select></label>
                {accessDurationChoice === "custom" && <label className="text-xs font-semibold text-slate-700">Durasi custom (jam)<input type="number" min="1" max="720" value={customAccessHours} onChange={(event) => setCustomAccessHours(event.target.value)} className="mt-1 block w-36 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>}
                <p className="text-xs text-slate-500">Izin berjangka berakhir otomatis. Durasi custom maksimal 30 hari.</p>
              </div>
              {patientActionMessage && (
                <div className="mt-5 break-all rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  {patientActionMessage}
                </div>
              )}

              {patientDoctorsLoading ? (
                <p className="mt-6 text-sm text-slate-500">Mengambil dokter terverifikasi...</p>
              ) : verifiedDoctors.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <Stethoscope size={32} className="mx-auto text-slate-400" />
                  <p className="mt-3 font-medium text-slate-700">Belum ada dokter terverifikasi</p>
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead><tr className="border-b border-slate-200 text-slate-500">
                      <th className="px-4 py-3 font-semibold">Doctor</th>
                      <th className="px-4 py-3 font-semibold">Wallet</th>
                      <th className="px-4 py-3 font-semibold">Access</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                    </tr></thead>
                    <tbody>
                      {verifiedDoctors.map((doctor) => {
                        const key = doctor.wallet_address.toLowerCase();
                        const hasAccess = patientAccess[key] === true;
                        const busy = patientActionWallet === key;
                        return (
                          <tr key={doctor.id} className="border-b border-slate-100">
                            <td className="px-4 py-4 font-semibold">{doctor.full_name}</td>
                            <td className="max-w-xs break-all px-4 py-4 font-mono text-xs text-slate-600">{doctor.wallet_address}</td>
                            <td className="px-4 py-4">
                              {patientAccess[key] === undefined ? "Belum dibaca" : hasAccess ? <div><p className="font-medium text-emerald-700">Aktif</p><p className="mt-1 text-xs text-slate-500">{patientAccessExpiry[key] ? `Kedaluwarsa ${new Date(patientAccessExpiry[key]).toLocaleString("id-ID")}` : "Tanpa kedaluwarsa"}</p></div> : <span className="capitalize text-slate-500">{patientAccessStatus[key] === "expired" ? "Kedaluwarsa" : patientAccessStatus[key] === "revoked" ? "Dicabut" : "Tidak diizinkan"}</span>}
                            </td>
                            <td className="px-4 py-4">
                              <button
                                onClick={() => handlePatientAccess(doctor, !hasAccess)}
                                disabled={!walletAddress || busy || patientAccess[key] === undefined}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${hasAccess ? "bg-red-600 hover:bg-red-700" : "bg-teal-600 hover:bg-teal-700"}`}
                              >
                                {busy ? "Memproses..." : hasAccess ? "Revoke Access" : "Grant Access"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!walletAddress && (
                <p className="mt-4 text-sm text-amber-600">Hubungkan wallet pasien terlebih dahulu untuk mengelola izin.</p>
              )}
              {walletAddress && (
                <button
                  onClick={() => refreshPatientAccess()}
                  className="mt-4 text-sm font-semibold text-teal-700 hover:underline"
                >Refresh access status from blockchain</button>
              )}
            </section>
          )}

          {role === "patient" && (
            <section id="appointments" className={`${activeSection === "appointments" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Appointment Management</h3>
                  <p className="text-sm text-slate-500">Ajukan konsultasi dengan dokter terverifikasi.</p>
                </div>
                <button onClick={fetchPatientAppointments} disabled={appointmentsLoading} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
                  {appointmentsLoading ? "Memuat..." : "Refresh Appointments"}
                </button>
              </div>
              {appointmentsError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{appointmentsError}</p>}
              {appointmentSuccess && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{appointmentSuccess}</p>}
              <div className="mt-5 flex gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-900"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-600 text-xs font-bold text-white">i</span><p><b>Petunjuk:</b> pilih dokter terverifikasi, tentukan waktu, lalu tulis keluhan singkat. Permintaan berstatus <b>Pending</b> sampai dokter merespons; jadwal yang bentrok akan ditolak.</p></div>
              <form onSubmit={handleCreateAppointment} className="mt-5 grid gap-4 rounded-xl bg-slate-50 p-4 md:grid-cols-2">
                <label className="text-sm font-medium text-slate-700">
                  Dokter
                  <select required value={appointmentDoctorId} onChange={(event) => setAppointmentDoctorId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                    <option value="">Pilih dokter terverifikasi</option>
                    {appointmentDoctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.full_name}</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Tanggal & waktu (durasi 30 menit)
                  <input required type="datetime-local" min={toLocalDateTimeInput(new Date(Date.now() + 30 * 60 * 1000))} value={appointmentStartAt} onChange={(event) => setAppointmentStartAt(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                </label>
                <label className="text-sm font-medium text-slate-700 md:col-span-2">
                  Keluhan / alasan konsultasi
                  <textarea required minLength={3} maxLength={2000} rows={3} value={appointmentComplaint} onChange={(event) => setAppointmentComplaint(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2" placeholder="Jelaskan alasan konsultasi secara singkat." />
                </label>
                <button type="submit" disabled={appointmentBusyId === "create" || !appointmentDoctors.length} className="w-fit rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                  {appointmentBusyId === "create" ? "Mengirim..." : "Buat Appointment"}
                </button>
                {!appointmentDoctors.length && <p className="text-sm text-amber-700">Belum ada dokter terverifikasi yang tersedia.</p>}
              </form>
              <div className="mt-6 space-y-3">
                {patientAppointments.length === 0 && !appointmentsLoading ? (
                  <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Belum ada appointment.</p>
                ) : patientAppointments.map((appointment) => (
                  <article key={appointment.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">Dr. {appointment.doctor_name}</p>
                        <p className="mt-1 text-sm text-slate-600">{new Date(appointment.start_at).toLocaleString()} · {appointment.duration_minutes} menit</p>
                      </div>
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{appointment.status}</span>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">Keluhan: {appointment.complaint}</p>
                    {appointment.rejection_reason && <p className="mt-2 text-sm text-red-700">Alasan penolakan: {appointment.rejection_reason}</p>}
                    {appointment.reschedule_requested_at && <p className="mt-2 text-sm text-amber-700">Reschedule diminta ke {new Date(appointment.reschedule_requested_at).toLocaleString()}: {appointment.reschedule_reason}</p>}
                    {["Pending", "Accepted", "Rescheduled"].includes(appointment.status) && new Date(appointment.start_at) > new Date() && (
                      <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 md:grid-cols-2">
                        {(appointment.status === "Accepted" || appointment.status === "Rescheduled") && (
                          <>
                            <input type="datetime-local" min={toLocalDateTimeInput(new Date(Date.now() + 30 * 60 * 1000))} value={patientRescheduleTimes[appointment.id] || ""} onChange={(event) => setPatientRescheduleTimes((current) => ({ ...current, [appointment.id]: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={patientRescheduleReasons[appointment.id] || ""} onChange={(event) => setPatientRescheduleReasons((current) => ({ ...current, [appointment.id]: event.target.value }))} maxLength={1000} placeholder="Alasan minta jadwal ulang" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <button onClick={() => handleRequestAppointmentReschedule(appointment)} disabled={appointmentBusyId === appointment.id || !patientRescheduleTimes[appointment.id]} className="w-fit rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Ajukan penjadwalan ulang</button>
                          </>
                        )}
                        <button onClick={() => handleCancelAppointment(appointment)} disabled={appointmentBusyId === appointment.id} className="w-fit rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Batalkan appointment</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <p className="mt-4 text-xs text-slate-500">Kebijakan: pasien dapat membatalkan appointment sebelum waktu konsultasi dimulai. Jadwal dokter berdurasi 30 menit; slot yang bentrok akan ditolak.</p>
            </section>
          )}

          {role === "patient" && (
            <section className={`${activeSection === "records" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">My Medical Records</h3>
                  <p className="text-sm text-slate-500">Commitment dan metadata transaksi yang tercatat di blockchain.</p>
                </div>
                <button
                  onClick={fetchOwnMedicalRecords}
                  disabled={patientRecordsLoading || !walletAddress}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {patientRecordsLoading ? "Memuat..." : "Load My Records"}
                </button>
              </div>
              <div className="mt-5 flex gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-950"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-700 font-bold text-white">i</span><p><b>Petunjuk:</b> gunakan filter dokter, kategori, atau tanggal untuk mencari record. Buka detail transaksi, lalu masukkan passphrase yang diberikan dokter untuk mengunduh file.</p></div>
              {patientRecordsError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{patientRecordsError}</p>}
              {hiddenPatientRecordCount > 0 && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  {hiddenPatientRecordCount} record disembunyikan setelah permintaan disetujui. Catatan blockchain dan file IPFS tetap tersimpan.
                </p>
              )}
              {patientRecords.length > 0 && (
                <div className="mt-5 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-xs font-semibold text-slate-600">
                    Dokter
                    <select value={timelineDoctorFilter} onChange={(event) => setTimelineDoctorFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                      <option value="all">Semua dokter</option>
                      {timelineDoctors.map((doctor) => <option key={doctor.address} value={doctor.address.toLowerCase()}>{doctor.name}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Kategori
                    <select value={timelineCategoryFilter} onChange={(event) => setTimelineCategoryFilter(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal">
                      <option value="all">Semua kategori</option>
                      {MEDICAL_RECORD_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Dari tanggal
                    <input type="date" value={timelineStartDate} onChange={(event) => setTimelineStartDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Sampai tanggal
                    <input type="date" value={timelineEndDate} onChange={(event) => setTimelineEndDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal" />
                  </label>
                </div>
              )}
              {patientRecords.length > 0 && (
                <div className="mt-6 space-y-4 border-l-2 border-teal-100 pl-5">
                  {filteredPatientRecords.map((record) => {
                    const CategoryIcon = getRecordCategoryIcon(record.category);
                    const detailsOpen = expandedRecordIndex === record.index;
                    return (
                    <article key={record.index} className="relative rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="absolute -left-[31px] top-5 rounded-full bg-teal-50 p-2 text-teal-700 ring-4 ring-white"><CategoryIcon size={18} /></div>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{record.category}</span>
                          <h4 className="mt-3 text-lg font-bold text-slate-800">{record.description && record.description !== "Deskripsi belum ditambahkan." ? record.description : `${record.category} · Record #${record.index + 1}`}</h4>
                          <p className="mt-1 text-sm text-slate-600">Dr. {record.doctorName}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-[11px]"><span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700">V{record.versionNumber}</span><span className={`rounded-full px-2.5 py-1 font-semibold ${record.signatureVerified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{record.signatureVerified ? "Signature valid" : "Unsigned / unverifiable"}</span></div>
                          <p className="mt-1 text-xs text-slate-500">{new Date(record.timestamp * 1000).toLocaleString()}</p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${record.cid ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                          {record.legacyRecord ? "Legacy chain · hash checked on download" : record.cid ? "Encrypted document available" : "Blockchain proof only"}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => setExpandedRecordIndex(detailsOpen ? null : record.index)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{detailsOpen ? "Tutup detail" : "Lihat detail"}</button>
                        {record.cid && <div className="flex flex-wrap gap-2"><input type="password" value={patientRecordPasswords[record.transactionHash]||""} onChange={(event)=>setPatientRecordPasswords((current)=>({...current,[record.transactionHash]:event.target.value}))} autoComplete="off" placeholder="Passphrase record ini" className="max-w-56 rounded-lg border border-slate-300 px-3 py-2 text-xs"/><button onClick={() => handleDownloadMedicalRecord(record)} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700">Unduh & verifikasi hash</button></div>}
                      </div>
                      {detailsOpen && (
                        <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">
                          <p><span className="font-semibold">Dokter:</span> {record.doctorName} ({record.doctorWallet})</p>
                          <p><span className="font-semibold">Commitment:</span> <span className="break-all font-mono">{record.commitment}</span></p>
                          <p><span className="font-semibold">Transaksi:</span> <span className="break-all font-mono">{record.transactionHash || "Tidak tersedia"}</span></p>
                          <p><span className="font-semibold">Block:</span> {record.blockNumber ?? "Tidak tersedia"}</p>
                          <p><span className="font-semibold">IPFS CID:</span> <span className="break-all font-mono">{record.cid || "Belum terhubung"}</span></p>
                          <p><span className="font-semibold">Versi:</span> V{record.versionNumber}{record.previousTransactionHash ? ` · revisi: ${record.changeReason || "alasan tidak tersedia"}` : " · record awal"}</p>
                          <p><span className="font-semibold">Tanda tangan dokter:</span> {record.signatureVerified ? `Valid · ${record.signedBy} · ${record.signedAt ? new Date(record.signedAt).toLocaleString("id-ID") : "waktu tercatat"}` : "Belum dapat diverifikasi"}</p>
                          {record.extractedResults?.length > 0 && <div className="mt-4 border-t border-slate-200 pt-3"><p className="font-semibold text-slate-800">Hasil OCR · ditinjau dokter{record.extractionReviewedAt ? ` · ${new Date(record.extractionReviewedAt).toLocaleString("id-ID")}` : ""}</p><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[480px] text-left"><thead><tr className="text-slate-500"><th className="py-1 pr-3">Pemeriksaan</th><th className="py-1 pr-3">Hasil</th><th className="py-1 pr-3">Satuan</th><th className="py-1">Rentang rujukan</th></tr></thead><tbody>{record.extractedResults.map((result, index) => <tr key={`${result.testName}-${index}`} className="border-t border-slate-200"><td className="py-1.5 pr-3 font-medium text-slate-700">{result.testName}</td><td className="py-1.5 pr-3">{result.resultValue}</td><td className="py-1.5 pr-3">{result.unit || "—"}</td><td className="py-1.5">{result.referenceRange || "—"}</td></tr>)}</tbody></table></div><p className="mt-2 text-[11px] text-slate-500">Ringkasan hasil ekstraksi. Lihat/unduh dokumen asli untuk konteks lengkap.</p></div>}
                        </div>
                      )}
                      {record.transactionHash && (() => {
                        const txKey = record.transactionHash.toLowerCase();
                        const request = deletionRequestStatus[txKey];
                        return (
                          <div className="mt-4 border-t border-slate-100 pt-4">
                            {request && (
                              <p className="text-xs text-slate-600">
                                Permintaan: <span className="font-semibold capitalize">{request.status}</span>
                                {request.review_note ? ` — ${request.review_note}` : ""}
                              </p>
                            )}
                            {request?.status === "approved" && (
                              <p className="mt-1 text-xs text-amber-700">
                                Permintaan diterima untuk diproses sesuai kebijakan retensi. Record blockchain dan file IPFS belum dihapus.
                              </p>
                            )}
                            {request?.status !== "pending" && (
                              <>
                                <label className="mt-3 block text-xs font-medium text-slate-600">
                                  Alasan pengajuan penghapusan
                                  <textarea
                                    value={deletionReasons[record.transactionHash] || ""}
                                    onChange={(event) => setDeletionReasons((current) => ({ ...current, [record.transactionHash]: event.target.value }))}
                                    maxLength={1000}
                                    rows={2}
                                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
                                    placeholder="Jelaskan alasan permintaan (jangan masukkan detail medis sensitif)."
                                  />
                                </label>
                                <button
                                  onClick={() => handleCreateDeletionRequest(record)}
                                  className="mt-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-50"
                                >Ajukan penghapusan untuk ditinjau</button>
                                {deletionRequestErrors[record.transactionHash] && (
                                  <p className="mt-2 text-xs text-red-700">{deletionRequestErrors[record.transactionHash]}</p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </article>
                    );
                  })}
                  {filteredPatientRecords.length === 0 && <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Tidak ada rekam medis yang cocok dengan filter.</p>}
                </div>
              )}
              {!patientRecordsLoading && !patientRecordsError && patientRecords.length === 0 && (
                <p className="mt-5 text-sm text-slate-500">
                  {hiddenPatientRecordCount > 0 ? "Tidak ada record aktif yang ditampilkan." : "Klik “Load My Records” untuk membaca catatan dari blockchain."}
                </p>
              )}
              <p className="mt-4 text-xs text-slate-500">Dokumen terenkripsi diunggah ke IPFS. File hanya dapat dibuka dengan passphrase yang diberikan dokter; hash diverifikasi terhadap blockchain saat diunduh.</p>
            </section>
          )}

          {/* Admin Doctor Management */}
          {role === "admin" && (
            <section id="admin-doctors" className={`${activeSection === "doctors" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                    <Users size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Doctor Management</h3>
                    <p className="text-sm text-slate-500">
                      Review doctor accounts and verify their blockchain registration.
                    </p>
                  </div>
                </div>

                <button
                  onClick={fetchAdminDoctors}
                  disabled={adminDoctorsLoading}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {adminDoctorsLoading ? "Loading..." : "Refresh Doctors"}
                </button>
              </div>

              {adminDoctorsError && (
                <div className="mt-5 break-words rounded-xl bg-red-50 p-4 text-sm text-red-700">
                  {adminDoctorsError}
                </div>
              )}

              {adminActionMessage && (
                <div className="mt-5 break-all rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  {adminActionMessage}
                </div>
              )}

              {adminDoctorsLoading ? (
                <p className="mt-6 text-sm text-slate-500">
                  Mengambil daftar dokter...
                </p>
              ) : adminDoctors.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <Stethoscope size={32} className="mx-auto text-slate-400" />
                  <p className="mt-3 font-medium text-slate-700">
                    Belum ada data dokter
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    Daftar dokter akan muncul di sini setelah tersedia.
                  </p>
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-4 py-3 font-semibold">Doctor</th>
                        <th className="px-4 py-3 font-semibold">Wallet Address</th>
                        <th className="px-4 py-3 font-semibold">Blockchain Status</th>
                        <th className="px-4 py-3 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {adminDoctors.map((doctor) => {
                        const registered = doctor.blockchain_registered;
                        const verified = doctor.blockchain_verified;

                        return (
                          <tr key={doctor.id} className="border-b border-slate-100">
                            <td className="px-4 py-4">
                              <p className="font-semibold text-slate-800">
                                {doctor.full_name}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {doctor.email}
                              </p>
                            </td>
                            <td className="max-w-xs break-all px-4 py-4 font-mono text-xs text-slate-600">
                              {doctor.wallet_address || "Wallet belum terhubung"}
                            </td>
                            <td className="px-4 py-4">
                              {verified === true ? (
                                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                                  Verified
                                </span>
                              ) : registered === true ? (
                                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                                  Registered - Pending
                                </span>
                              ) : registered === false ? (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                  Not Registered
                                </span>
                              ) : (
                                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
                                  Not Checked
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => handleCheckDoctorStatus(doctor)}
                                  disabled={
                                    !doctor.wallet_address ||
                                    checkingDoctorId === doctor.id ||
                                    verifyingDoctorId === doctor.id
                                  }
                                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {checkingDoctorId === doctor.id
                                    ? "Checking..."
                                    : "Check Status"}
                                </button>
                                <button
                                  onClick={() => handleVerifyDoctor(doctor)}
                                  disabled={
                                    !doctor.wallet_address ||
                                    verifyingDoctorId === doctor.id ||
                                    checkingDoctorId === doctor.id ||
                                    verified === true
                                  }
                                  className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  {verifyingDoctorId === doctor.id
                                    ? "Verifying..."
                                    : verified === true
                                      ? "Verified"
                                      : "Verify Doctor"}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="mt-4 text-xs text-slate-500">
                Gunakan wallet Admin yang menjadi owner Smart Contract untuk melakukan verifikasi.
                Status blockchain diperbarui setelah menekan Check Status atau Verify Doctor.
              </p>
            </section>
          )}

          {role === "admin" && (
            <section className={`${activeSection === "deletions" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Record Deletion Requests</h3>
                  <p className="text-sm text-slate-500">Tinjau permintaan pasien sesuai kebijakan retensi fasilitas.</p>
                </div>
                <button
                  onClick={fetchAdminDeletionRequests}
                  disabled={adminDeletionLoading}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >{adminDeletionLoading ? "Memuat..." : "Refresh Requests"}</button>
              </div>
              {adminDeletionError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{adminDeletionError}</p>}
              {adminDeletionLoading ? (
                <p className="mt-5 text-sm text-slate-500">Memuat permintaan...</p>
              ) : adminDeletionRequests.length === 0 ? (
                <p className="mt-5 text-sm text-slate-500">Belum ada permintaan penghapusan record.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {adminDeletionRequests.map((request) => (
                    <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="font-semibold">{request.patient_name}</p>
                          <p className="mt-1 text-xs text-slate-500">Diajukan oleh {request.requester_name || request.patient_name} ({request.requester_role || "patient"})</p>
                          <p className="text-xs text-slate-500">{request.patient_email} · {new Date(request.created_at).toLocaleString()}</p>
                          <p className="mt-2 break-all font-mono text-xs text-slate-600">{request.transaction_hash}</p>
                        </div>
                        <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${request.status === "pending" ? "bg-amber-100 text-amber-800" : request.status === "approved" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="mt-3 text-sm text-slate-700">Alasan: {request.reason}</p>
                      {request.review_note && <p className="mt-2 text-sm text-slate-600">Catatan: {request.review_note}</p>}
                      {request.status === "pending" && (
                        <div className="mt-4">
                          <textarea
                            value={adminReviewNotes[request.id] || ""}
                            onChange={(event) => setAdminReviewNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                            maxLength={1000}
                            rows={2}
                            placeholder="Catatan peninjauan (opsional)"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              onClick={() => handleReviewDeletionRequest(request, "approved")}
                              disabled={adminDeletionBusyId === request.id}
                              className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                            >Setujui & revoke on-chain</button>
                            <button
                              onClick={() => handleReviewDeletionRequest(request, "rejected")}
                              disabled={adminDeletionBusyId === request.id}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >Tolak</button>
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-amber-700">
                Setujui dengan wallet owner kontrak untuk mencatat status revoked di blockchain. Ciphertext IPFS tidak terhapus otomatis.
              </p>
            </section>
          )}

          {/* Doctor Blockchain Registration */}
          {role === "doctor" && (
            <section id="doctor-status" className={`${activeSection === "verification" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h3 className="font-semibold">Doctor Blockchain Registration</h3>
                  <p className="text-sm text-slate-500">
                    Register your linked doctor wallet on the blockchain.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                {doctorStatusLoading ? (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                    Memeriksa status wallet dokter di blockchain...
                  </div>
                ) : doctorRegistered ? (
                  <div className={`rounded-xl p-4 text-sm font-medium ${doctorVerified ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>
                    {doctorVerified
                      ? "Wallet dokter sudah terdaftar dan diverifikasi di blockchain."
                      : "Wallet dokter sudah terdaftar. Menunggu verifikasi Admin."}
                  </div>
                ) : (
                  <button
                    onClick={handleRegisterDoctor}
                    disabled={doctorLoading || walletLoading || !walletAddress}
                    className="rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {doctorLoading
                      ? "Processing Transaction..."
                      : "Register on Blockchain"}
                  </button>
                )}
              </div>

              <button
                onClick={refreshOwnDoctorStatus}
                disabled={doctorStatusLoading || !walletAddress}
                className="mt-3 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Refresh Registration Status
              </button>

              {!walletAddress && (
                <p className="mt-3 text-sm text-amber-600">
                  Hubungkan wallet terlebih dahulu sebelum melakukan registrasi.
                </p>
              )}

              {doctorError && (
                <div className="mt-4 break-all rounded-xl bg-red-50 p-4 text-sm text-red-600">
                  {doctorError}
                </div>
              )}

              {doctorSuccess && (
                <div className="mt-4 break-all rounded-xl bg-green-50 p-4 text-sm text-green-700">
                  {doctorSuccess}
                </div>
              )}
            </section>
          )}

          {role === "doctor" && (
            <section id="appointments" className={`${activeSection === "appointments" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold">Appointment Schedule</h3>
                  <p className="text-sm text-slate-500">Kelola permintaan dan konsultasi pasien.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" value={appointmentDateFilter} onChange={(event) => setAppointmentDateFilter(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <button onClick={fetchDoctorAppointments} disabled={appointmentsLoading} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50">Refresh</button>
                </div>
              </div>
              {appointmentsError && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{appointmentsError}</p>}
              <div className="mt-4 flex gap-3 rounded-xl border border-teal-100 bg-teal-50/70 p-4 text-sm text-teal-950"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-teal-600 font-bold text-white">i</span><p><b>Petunjuk dokter:</b> pilih tanggal untuk melihat jadwal, lalu terima atau tolak permintaan. Jika pasien meminta jadwal baru, atur waktu pengganti dan pilih <b>Jadwalkan ulang</b>.</p></div>
              {appointmentsLoading ? <p className="mt-5 text-sm text-slate-500">Memuat jadwal...</p> : doctorAppointments.length === 0 ? (
                <p className="mt-5 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Tidak ada appointment pada tanggal ini.</p>
              ) : (
                <div className="mt-5 space-y-4">
                  {doctorAppointments.map((appointment) => (
                    <article key={appointment.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{appointment.patient_name}</p>
                          <p className="mt-1 text-xs text-slate-500">{appointment.patient_email}</p>
                          <p className="mt-2 text-sm text-slate-700">{new Date(appointment.start_at).toLocaleString()} · {appointment.duration_minutes} menit</p>
                        </div>
                        <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{appointment.status}</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-700">Keluhan: {appointment.complaint}</p>
                      {appointment.reschedule_requested_at && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Pasien meminta jadwal {new Date(appointment.reschedule_requested_at).toLocaleString()}. Alasan: {appointment.reschedule_reason}</p>}
                      {appointment.status === "Pending" && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <input value={appointmentRejectionReasons[appointment.id] || ""} onChange={(event) => setAppointmentRejectionReasons((current) => ({ ...current, [appointment.id]: event.target.value }))} maxLength={1000} placeholder="Alasan wajib jika menolak" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => handleAppointmentDecision(appointment, "Accepted")} disabled={appointmentBusyId === appointment.id} className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Terima</button>
                            <button onClick={() => handleAppointmentDecision(appointment, "Rejected")} disabled={appointmentBusyId === appointment.id || (appointmentRejectionReasons[appointment.id] || "").trim().length < 3} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Tolak</button>
                          </div>
                        </div>
                      )}
                      {["Accepted", "Rescheduled"].includes(appointment.status) && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
                          <input type="datetime-local" min={toLocalDateTimeInput(new Date(Date.now() + 30 * 60 * 1000))} value={appointmentRescheduleTimes[appointment.id] ?? toLocalDateTimeInput(appointment.reschedule_requested_at || appointment.start_at)} onChange={(event) => setAppointmentRescheduleTimes((current) => ({ ...current, [appointment.id]: event.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                          <button onClick={() => handleDoctorReschedule(appointment)} disabled={appointmentBusyId === appointment.id} className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50">Jadwalkan ulang</button>
                          <button onClick={() => handleCompleteAppointment(appointment)} disabled={appointmentBusyId === appointment.id || new Date(appointment.start_at) > new Date()} className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Tandai selesai</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {role === "doctor" && (
            <section id="patient-list" className={`${activeSection === "patients" ? "" : "hidden"} mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-teal-50 p-3 text-teal-600">
                    <Users size={22} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Patients Who Granted Access</h3>
                    <p className="text-sm text-slate-500">
                      Daftar ini hanya memuat pasien dengan izin aktif di blockchain.
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchAuthorizedPatients}
                  disabled={authorizedPatientsLoading}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {authorizedPatientsLoading ? "Memuat..." : "Refresh Patients"}
                </button>
              </div>

              {authorizedPatientsError && (
                <div className="mt-5 break-words rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                  {authorizedPatientsError}
                </div>
              )}

              {authorizedPatientsLoading ? (
                <p className="mt-6 text-sm text-slate-500">Memeriksa izin pasien di blockchain...</p>
              ) : authorizedPatients.length === 0 ? (
                <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                  <Users size={32} className="mx-auto text-slate-400" />
                  <p className="mt-3 font-medium text-slate-700">Belum ada pasien yang memberi akses</p>
                  <p className="mt-1 text-sm text-slate-500">Pasien akan muncul di sini setelah transaksi grant access berhasil.</p>
                </div>
              ) : (
                <div className="mt-6 overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="px-4 py-3 font-semibold">Patient</th>
                        <th className="px-4 py-3 font-semibold">Email</th>
                        <th className="px-4 py-3 font-semibold">Wallet Address</th>
                        <th className="px-4 py-3 font-semibold">Permission</th>
                        <th className="px-4 py-3 font-semibold">Add Record</th>
                      </tr>
                    </thead>
                    <tbody>
                      {authorizedPatients.map((patient) => (
                        <tr key={patient.id} className="border-b border-slate-100">
                          <td className="px-4 py-4 font-semibold text-slate-800">{patient.full_name}</td>
                          <td className="px-4 py-4 text-slate-600">{patient.email}</td>
                          <td className="max-w-xs break-all px-4 py-4 font-mono text-xs text-slate-600">{patient.wallet_address}</td>
                          <td className="px-4 py-4">
                            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Active</span>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex min-w-56 flex-col gap-2">
                              <input
                                ref={(node) => { recordFileInputs.current[patient.id] = node; }}
                                type="file"
                                onChange={(event) => setRecordFiles((current) => ({
                                  ...current,
                                  [patient.id]: event.target.files?.[0] || null,
                                }))}
                                disabled={recordActions[patient.id]}
                                className="hidden"
                                aria-label={`Choose a medical record for ${patient.full_name}`}
                              />
                              {recordFiles[patient.id] && (
                                <p className="max-w-56 truncate text-xs text-slate-600">
                                  {recordFiles[patient.id].name}
                                </p>
                              )}
                              {recordFiles[patient.id] && (
                                <>
                                  <button type="button" onClick={() => loadRecordVersions(patient)} className="rounded-md border border-slate-300 px-2 py-1 text-xs">Muat versi sebelumnya</button>
                                  {(recordVersionOptions[patient.id] || []).length > 0 && <select value={recordVersionSelections[patient.id] || ""} onChange={(event) => setRecordVersionSelections((current) => ({ ...current, [patient.id]: event.target.value }))} className="rounded-md border border-slate-300 px-2 py-1 text-xs"><option value="">Buat record baru</option>{recordVersionOptions[patient.id].map((record) => <option key={record.transaction_hash} value={record.transaction_hash}>Versi {record.version_number} · {record.category} · {record.transaction_hash.slice(0, 10)}…</option>)}</select>}
                                  {recordVersionSelections[patient.id] && <textarea value={recordVersionReasons[patient.id] || ""} onChange={(event) => setRecordVersionReasons((current) => ({ ...current, [patient.id]: event.target.value }))} maxLength={1000} rows={2} placeholder="Alasan revisi minimal 5 karakter" className="rounded-md border border-slate-300 px-2 py-1 text-xs"/>}
                                </>
                              )}
                              {recordFiles[patient.id] && (
                                <input
                                  type="password"
                                  value={recordPasswords[patient.id] || ""}
                                  onChange={(event) => setRecordPasswords((current) => ({ ...current, [patient.id]: event.target.value }))}
                                  placeholder="Passphrase (min. 12 chars)"
                                  autoComplete="new-password"
                                  className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                  aria-label={`Encryption passphrase for ${patient.full_name}`}
                                />
                              )}
                              {recordFiles[patient.id] && (
                                <>
                                  <select
                                    value={recordCategories[patient.id] || "Other"}
                                    onChange={(event) => setRecordCategories((current) => ({ ...current, [patient.id]: event.target.value }))}
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                    aria-label={`Record category for ${patient.full_name}`}
                                  >
                                    {MEDICAL_RECORD_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                                  </select>
                                  <textarea
                                    value={recordDescriptions[patient.id] || ""}
                                    onChange={(event) => setRecordDescriptions((current) => ({ ...current, [patient.id]: event.target.value }))}
                                    maxLength={2000}
                                    rows={2}
                                    placeholder="Deskripsi singkat pemeriksaan (maks. 2000 karakter)"
                                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                                    aria-label={`Record description for ${patient.full_name}`}
                                  />
                                </>
                              )}
                              <button
                                onClick={() => recordFiles[patient.id]
                                  ? handleAddMedicalRecord(patient)
                                  : recordFileInputs.current[patient.id]?.click()}
                                disabled={recordActions[patient.id] || !walletAddress}
                                className="rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
                              >
                                {recordActions[patient.id]
                                  ? "Recording..."
                                  : recordFiles[patient.id]
                                    ? "Hash & Record"
                                    : "Choose File"}
                              </button>
                              {recordMessages[patient.id] && (
                                <p className="max-w-64 break-all text-xs text-slate-600">{recordMessages[patient.id]}</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-4 text-xs text-slate-500">
                File dienkripsi di browser sebelum diunggah. Setelah transaksi, MetaMask meminta tanda tangan pesan untuk mengesahkan commitment (tanpa gas). Berikan passphrase kepada pasien melalui jalur aman terpisah.
              </p>
            </section>
          )}

          <AdvancedFeatures role={role} activeSection={activeSection} walletAddress={walletAddress} authorizedPatients={role === "patient" ? verifiedDoctors : authorizedPatients} />
          {((role === "doctor" || role === "patient") && activeSection === "ai") && <AIWorkspace role={role} patients={authorizedPatients} />}
          {role === "admin" && activeSection === "audit" && <AuditTrail />}
          {(role === "admin" || role === "doctor") && activeSection === "emergency" && <EmergencyAccessPanel role={role} walletAddress={walletAddress} authorizedPatients={authorizedPatients} />}

          {notificationToast && <button type="button" onClick={() => { setNotificationToast(null); selectSection("notifications"); }} className="fixed bottom-5 right-5 z-50 w-[min(92vw,380px)] rounded-2xl border border-teal-200 bg-white p-4 text-left shadow-2xl shadow-slate-900/15"><span className="flex items-start gap-3"><span className="rounded-xl bg-teal-100 p-2 text-teal-800"><Bell size={18}/></span><span className="min-w-0 flex-1"><b className="block text-sm text-slate-900">{notificationToast.title}</b><span className="mt-1 block text-xs leading-5 text-slate-600">{notificationToast.message}</span><span className="mt-2 block text-[11px] font-semibold text-teal-700">Buka Notification Center</span></span><span onClick={(event) => { event.stopPropagation(); setNotificationToast(null); }} className="text-slate-400">×</span></span></button>}

          <p className="mt-8 text-center text-xs text-slate-400">
            MediChain © 2026. Blockchain-Based Medical Record System.
          </p>
        </div>
      </main>
    </div>
  );
}
