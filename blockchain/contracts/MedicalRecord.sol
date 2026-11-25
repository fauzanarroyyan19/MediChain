
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/access/Ownable.sol";

contract MedicalRecord is Ownable {

    struct Doctor {
        bool registered;
        bool verified;
    }

    struct MedicalRecordData {
        bytes32 commitment;
        address uploadedBy;
        uint256 timestamp;
        bytes32 previousCommitment;
        uint256 version;
    }

    mapping(address => Doctor) public doctors;

    mapping(address => mapping(address => bool)) private grantedPermissions;
    mapping(address => mapping(address => uint64)) public accessExpiry;
    mapping(address => mapping(address => uint64)) public emergencyAccessExpiry;
    mapping(address => mapping(bytes32 => bool)) public knownCommitments;
    mapping(address => mapping(bytes32 => bool)) public revokedCommitments;
    mapping(address => mapping(bytes32 => uint256)) public recordVersions;

    mapping(address => MedicalRecordData[])
        private patientRecords;

    event DoctorRegistered(address indexed doctor);

    event DoctorVerified(address indexed doctor);

    event AccessGranted(
        address indexed patient,
        address indexed doctor
    );

    event AccessRevoked(
        address indexed patient,
        address indexed doctor
    );

    event AccessGrantedUntil(
        address indexed patient,
        address indexed doctor,
        uint64 expiresAt
    );

    event RecordAdded(
        address indexed patient,
        address indexed doctor,
        bytes32 commitment,
        uint256 timestamp
    );

    event RecordVersioned(address indexed patient, address indexed doctor, bytes32 indexed commitment, bytes32 previousCommitment, uint256 version);
    event RecordRevoked(address indexed patient, bytes32 indexed commitment, bytes32 reasonHash, address revokedBy, uint256 timestamp);
    event EmergencyAccessGranted(address indexed patient, address indexed doctor, uint64 expiresAt, bytes32 reasonHash);
    event EmergencyAccessRevoked(address indexed patient, address indexed doctor, address revokedBy);

    constructor() Ownable(msg.sender) {}

    // Doctor registration
    function registerDoctor() external {
        require(
            !doctors[msg.sender].registered,
            "Already registered"
        );

        doctors[msg.sender] = Doctor({
            registered: true,
            verified: false
        });

        emit DoctorRegistered(msg.sender);
    }

    // Admin verifies doctor
    function verifyDoctor(address doctor) external onlyOwner {
        require(
            doctors[doctor].registered,
            "Doctor not registered"
        );

        doctors[doctor].verified = true;

        emit DoctorVerified(doctor);
    }

    // Patient grants access
    function grantAccess(address doctor) external {
        _grantAccess(doctor, 0);
    }

    // Patient grants time-limited access, typically after approving a QR request.
    function grantAccessUntil(address doctor, uint64 expiresAt) external {
        require(expiresAt > block.timestamp, "Invalid access expiry");
        _grantAccess(doctor, expiresAt);
        emit AccessGrantedUntil(msg.sender, doctor, expiresAt);
    }

    function _grantAccess(address doctor, uint64 expiresAt) internal {
        require(
            doctors[doctor].verified,
            "Doctor not verified"
        );

        require(
            !accessPermissions(msg.sender, doctor),
            "Access already granted"
        );

        grantedPermissions[msg.sender][doctor] = true;
        accessExpiry[msg.sender][doctor] = expiresAt;

        emit AccessGranted(msg.sender, doctor);
    }

    function accessPermissions(address patient, address doctor) public view returns (bool) {
        return regularAccessPermissions(patient, doctor) || block.timestamp < emergencyAccessExpiry[patient][doctor];
    }

    function regularAccessPermissions(address patient, address doctor) public view returns (bool) {
        uint64 expiresAt = accessExpiry[patient][doctor];
        return grantedPermissions[patient][doctor] && (expiresAt == 0 || block.timestamp < expiresAt);
    }

    function grantEmergencyAccess(address patient, address doctor, uint64 expiresAt, bytes32 reasonHash) external onlyOwner {
        require(patient != address(0) && doctor != address(0), "Invalid address");
        require(doctors[doctor].verified, "Doctor not verified");
        require(expiresAt > block.timestamp && expiresAt <= block.timestamp + 24 hours, "Emergency access max 24 hours");
        require(reasonHash != bytes32(0), "Reason required");
        emergencyAccessExpiry[patient][doctor] = expiresAt;
        emit EmergencyAccessGranted(patient, doctor, expiresAt, reasonHash);
    }

    function revokeEmergencyAccess(address patient, address doctor) external onlyOwner {
        require(emergencyAccessExpiry[patient][doctor] > 0, "Emergency access missing");
        emergencyAccessExpiry[patient][doctor] = 0;
        emit EmergencyAccessRevoked(patient, doctor, msg.sender);
    }

    // Patient revokes access
    function revokeAccess(address doctor) external {
        require(
            accessPermissions(msg.sender, doctor),
            "Access not granted"
        );

        grantedPermissions[msg.sender][doctor] = false;
        accessExpiry[msg.sender][doctor] = 0;
        if (emergencyAccessExpiry[msg.sender][doctor] > 0) {
            emergencyAccessExpiry[msg.sender][doctor] = 0;
            emit EmergencyAccessRevoked(msg.sender, doctor, msg.sender);
        }

        emit AccessRevoked(msg.sender, doctor);
    }

    // Add medical record commitment
    function addRecord(
        address patient,
        bytes32 commitment
    ) external {
        _addRecord(patient, commitment, bytes32(0), 1);
    }

    function addRecordVersion(address patient, bytes32 commitment, bytes32 previousCommitment) external {
        require(knownCommitments[patient][previousCommitment], "Previous record missing");
        require(!revokedCommitments[patient][previousCommitment], "Previous record revoked");
        _addRecord(patient, commitment, previousCommitment, recordVersions[patient][previousCommitment] + 1);
        emit RecordVersioned(patient, msg.sender, commitment, previousCommitment, recordVersions[patient][commitment]);
    }

    function _addRecord(address patient, bytes32 commitment, bytes32 previousCommitment, uint256 version) internal {
        require(
            doctors[msg.sender].verified ||
            msg.sender == patient,
            "Unauthorized"
        );

        require(
            msg.sender == patient ||
            accessPermissions(patient, msg.sender),
            "Access denied"
        );

        require(
            commitment != bytes32(0),
            "Invalid commitment"
        );
        require(!knownCommitments[patient][commitment], "Commitment already used");

        knownCommitments[patient][commitment] = true;
        recordVersions[patient][commitment] = version;

        patientRecords[patient].push(
            MedicalRecordData({
                commitment: commitment,
                uploadedBy: msg.sender,
                timestamp: block.timestamp,
                previousCommitment: previousCommitment,
                version: version
            })
        );

        emit RecordAdded(
            patient,
            msg.sender,
            commitment,
            block.timestamp
        );
    }

    function revokeRecord(address patient, bytes32 commitment, bytes32 reasonHash) external onlyOwner {
        require(patient != address(0) && commitment != bytes32(0), "Invalid record reference");
        require(!revokedCommitments[patient][commitment], "Record already revoked");
        require(reasonHash != bytes32(0), "Reason required");
        revokedCommitments[patient][commitment] = true;
        emit RecordRevoked(patient, commitment, reasonHash, msg.sender, block.timestamp);
    }

    // View record count
    function getRecordCount(
        address patient
    ) external view returns (uint256) {
        require(
            msg.sender == patient ||
            accessPermissions(patient, msg.sender),
            "Access denied"
        );

        return patientRecords[patient].length;
    }

    // Get a specific record
    function getRecord(
        address patient,
        uint256 index
    ) external view returns (
        bytes32 commitment,
        address uploadedBy,
        uint256 timestamp
    ) {
        require(
            msg.sender == patient ||
            accessPermissions(patient, msg.sender),
            "Access denied"
        );

        require(
            index < patientRecords[patient].length,
            "Invalid index"
        );

        MedicalRecordData memory record =
            patientRecords[patient][index];

        return (
            record.commitment,
            record.uploadedBy,
            record.timestamp
        );
    }
}
