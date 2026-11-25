
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MedicalRecord", function () {
  let medicalRecord;
  let owner;
  let patient;
  let doctor;

  beforeEach(async function () {
    [owner, patient, doctor] = await ethers.getSigners();

    const MedicalRecord = await ethers.getContractFactory(
      "MedicalRecord"
    );

    medicalRecord = await MedicalRecord.deploy();
    await medicalRecord.waitForDeployment();
  });

  describe("Doctor Registration", function () {
    it("Should allow doctor to register", async function () {
      await medicalRecord.connect(doctor).registerDoctor();

      const result = await medicalRecord.doctors(doctor.address);

      expect(result.registered).to.equal(true);
      expect(result.verified).to.equal(false);
    });

    it("Should allow owner to verify doctor", async function () {
      await medicalRecord.connect(doctor).registerDoctor();

      await medicalRecord.verifyDoctor(doctor.address);

      const result = await medicalRecord.doctors(doctor.address);

      expect(result.verified).to.equal(true);
    });
  });

  describe("Access Permission", function () {
    beforeEach(async function () {
      await medicalRecord.connect(doctor).registerDoctor();
      await medicalRecord.verifyDoctor(doctor.address);
    });

    it("Should allow patient to grant access", async function () {
      await medicalRecord
        .connect(patient)
        .grantAccess(doctor.address);

      expect(
        await medicalRecord.accessPermissions(
          patient.address,
          doctor.address
        )
      ).to.equal(true);
    });

    it("Should allow patient to revoke access", async function () {
      await medicalRecord
        .connect(patient)
        .grantAccess(doctor.address);

      await medicalRecord
        .connect(patient)
        .revokeAccess(doctor.address);

      expect(
        await medicalRecord.accessPermissions(
          patient.address,
          doctor.address
        )
      ).to.equal(false);
    });
  });

  describe("Medical Records", function () {
    beforeEach(async function () {
      await medicalRecord.connect(doctor).registerDoctor();
      await medicalRecord.verifyDoctor(doctor.address);

      await medicalRecord
        .connect(patient)
        .grantAccess(doctor.address);
    });

    it("Should allow doctor to add medical record", async function () {
      const commitment = ethers.keccak256(
        ethers.toUtf8Bytes("medical-record-001")
      );

      await medicalRecord
        .connect(doctor)
        .addRecord(patient.address, commitment);

      const count = await medicalRecord
        .connect(patient)
        .getRecordCount(patient.address);

      expect(count).to.equal(1n);
    });

    it("Should allow patient to read medical record", async function () {
      const commitment = ethers.keccak256(
        ethers.toUtf8Bytes("medical-record-001")
      );

      await medicalRecord
        .connect(doctor)
        .addRecord(patient.address, commitment);

      const record = await medicalRecord
        .connect(patient)
        .getRecord(patient.address, 0);

      expect(record.commitment).to.equal(commitment);
      expect(record.uploadedBy).to.equal(doctor.address);
    });

    it("Should prevent unauthorized doctor from accessing records", async function () {
      const [, , , unauthorizedDoctor] = await ethers.getSigners();

      await expect(
        medicalRecord
          .connect(unauthorizedDoctor)
          .getRecordCount(patient.address)
      ).to.be.revertedWith("Access denied");
    });
  });
});
