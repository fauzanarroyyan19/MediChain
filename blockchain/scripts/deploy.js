
const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying MediChain Smart Contract...");

  const signers = await ethers.getSigners();

  // Menggunakan Hardhat Account #2 sebagai Admin
  const deployer = signers[2];

  console.log("Deploying with account:", deployer.address);

  const MedicalRecord = await ethers.getContractFactory(
    "MedicalRecord",
    deployer
  );

  const medicalRecord = await MedicalRecord.deploy();

  await medicalRecord.waitForDeployment();

  const contractAddress = await medicalRecord.getAddress();

  console.log("=================================");
  console.log("MediChain deployed successfully!");
  console.log("Contract Owner:", deployer.address);
  console.log("Contract Address:", contractAddress);
  console.log("=================================");
}

main().catch((error) => {
  console.error("Deployment failed:", error);
  process.exitCode = 1;
});
