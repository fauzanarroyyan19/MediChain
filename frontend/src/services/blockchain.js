
import { ethers } from "ethers";
import MedicalRecordArtifact from "../abi/MedicalRecord.json";

const CONTRACT_ADDRESS = import.meta.env
  .VITE_MEDICAL_RECORD_CONTRACT_ADDRESS;

const LOCAL_CHAIN_ID = 31337n;
const walletTransactionQueues = new Map();

async function withWalletTransaction(walletAddress, action) {
  const key = walletAddress.toLowerCase();
  const previous = walletTransactionQueues.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  const queued = previous.catch(() => {}).then(() => current);
  walletTransactionQueues.set(key, queued);
  await previous.catch(() => {});

  try {
    const [activeAddress] = await window.ethereum.request({ method: "eth_accounts" });
    if (!activeAddress || activeAddress.toLowerCase() !== key) {
      throw new Error("Akun MetaMask berubah sebelum transaksi diproses. Pilih kembali wallet ini dan ulangi.");
    }
    return await action();
  } finally {
    release();
    if (walletTransactionQueues.get(key) === queued) {
      walletTransactionQueues.delete(key);
    }
  }
}

async function getContract() {
  if (!window.ethereum) {
    throw new Error("MetaMask belum terpasang.");
  }

  if (!CONTRACT_ADDRESS) {
    throw new Error("Contract address belum dikonfigurasi.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);

  await provider.send("eth_requestAccounts", []);

  const signer = await provider.getSigner();
  const network = await provider.getNetwork();

  if (network.chainId !== LOCAL_CHAIN_ID) {
    throw new Error("Silakan gunakan jaringan Hardhat Local.");
  }

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    MedicalRecordArtifact.abi,
    signer
  );

  return { contract, signer };
}

async function getReadOnlyContract() {
  if (!window.ethereum) throw new Error("MetaMask belum terpasang.");
  if (!CONTRACT_ADDRESS) throw new Error("Contract address belum dikonfigurasi.");
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (network.chainId !== LOCAL_CHAIN_ID) {
    throw new Error("Silakan gunakan jaringan Hardhat Local.");
  }
  return new ethers.Contract(CONTRACT_ADDRESS, MedicalRecordArtifact.abi, provider);
}

// Memeriksa owner Smart Contract
export async function checkContractOwner() {
  const { contract, signer } = await getContract();

  const walletAddress = await signer.getAddress();
  const ownerAddress = await contract.owner();

  return {
    walletAddress,
    ownerAddress,
    isOwner:
      walletAddress.toLowerCase() === ownerAddress.toLowerCase(),
  };
}

// Memeriksa status dokter di blockchain
export async function getDoctorBlockchainStatus(doctorAddress) {
  if (!window.ethereum) {
    throw new Error("MetaMask belum terpasang.");
  }
  if (!CONTRACT_ADDRESS) {
    throw new Error("Contract address belum dikonfigurasi.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (network.chainId !== LOCAL_CHAIN_ID) {
    throw new Error("Silakan gunakan jaringan Hardhat Local.");
  }

  const contract = new ethers.Contract(
    CONTRACT_ADDRESS,
    MedicalRecordArtifact.abi,
    provider
  );

  const doctor = await contract.doctors(doctorAddress);

  return {
    registered: doctor.registered,
    verified: doctor.verified,
  };
}

// Registrasi dokter ke blockchain
export async function registerDoctorOnBlockchain(expectedWalletAddress) {
  const { contract, signer } = await getContract();

  const walletAddress = await signer.getAddress();

  // Pastikan wallet MetaMask sesuai dengan wallet akun dokter
  if (
    expectedWalletAddress &&
    walletAddress.toLowerCase() !== expectedWalletAddress.toLowerCase()
  ) {
    throw new Error(
      "Wallet MetaMask tidak sesuai dengan wallet yang terhubung ke akun dokter."
    );
  }

  return withWalletTransaction(walletAddress, async () => {
    const doctor = await contract.doctors(walletAddress);
    if (doctor.registered) {
      return { alreadyRegistered: true, verified: doctor.verified, walletAddress };
    }
    const transaction = await contract.registerDoctor();
    const receipt = await transaction.wait();
    return {
      alreadyRegistered: false,
      walletAddress,
      transactionHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      status: receipt.status,
    };
  });
}

// Verifikasi dokter oleh Admin
export async function verifyDoctorOnBlockchain(doctorAddress) {
  const { contract, signer } = await getContract();

  const walletAddress = await signer.getAddress();
  return withWalletTransaction(walletAddress, async () => {
  const ownerAddress = await contract.owner();

  if (ownerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error(
      "Wallet ini bukan pemilik Smart Contract. Silakan gunakan wallet Admin."
    );
  }

  const doctor = await contract.doctors(doctorAddress);

  if (!doctor.registered) {
    throw new Error(
      "Dokter belum melakukan registrasi di blockchain."
    );
  }

  if (doctor.verified) {
    return {
      alreadyVerified: true,
      walletAddress: doctorAddress,
    };
  }

  const transaction = await contract.verifyDoctor(doctorAddress);
  const receipt = await transaction.wait();

  return {
    alreadyVerified: false,
    transactionHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    status: receipt.status,
  };
  });
}

async function getPatientContract(expectedWalletAddress) {
  const { contract, signer } = await getContract();
  const requestedAddress = ethers.getAddress(expectedWalletAddress);
  const walletAddress = await signer.getAddress();

  if (
    walletAddress.toLowerCase() !== requestedAddress.toLowerCase()
  ) {
    throw new Error(
      "Wallet MetaMask tidak sesuai dengan wallet yang terhubung ke akun pasien."
    );
  }

  // Pin the contract runner to the linked patient address, so reads and writes
  // cannot silently use a different default signer from the injected wallet.
  const provider = signer.provider;
  const [activeAddress] = await provider.send("eth_accounts", []);
  if (!activeAddress || activeAddress.toLowerCase() !== requestedAddress.toLowerCase()) {
    throw new Error("Akun MetaMask aktif berubah. Pilih wallet pasien yang terhubung ke akun MediChain lalu coba lagi.");
  }
  const patientSigner = await provider.getSigner(requestedAddress);
  return { contract: contract.connect(patientSigner), walletAddress: requestedAddress };
}

export async function getPatientDoctorAccess(patientAddress, doctorAddress) {
  const contract = await getReadOnlyContract();
  return contract.accessPermissions(patientAddress, doctorAddress);
}

export async function getPatientDoctorAccessDetails(patientAddress, doctorAddress) {
  const contract = await getReadOnlyContract();
  const [active, regular, regularExpiry, emergencyExpiry] = await Promise.all([
    contract.accessPermissions(patientAddress, doctorAddress),
    contract.regularAccessPermissions(patientAddress, doctorAddress),
    contract.accessExpiry(patientAddress, doctorAddress),
    contract.emergencyAccessExpiry(patientAddress, doctorAddress),
  ]);
  const expiry = regular ? regularExpiry : emergencyExpiry;
  const historyFilters = [
    contract.filters.AccessGranted(patientAddress, doctorAddress),
    contract.filters.AccessGrantedUntil(patientAddress, doctorAddress),
    contract.filters.AccessRevoked(patientAddress, doctorAddress),
    contract.filters.EmergencyAccessGranted(patientAddress, doctorAddress),
    contract.filters.EmergencyAccessRevoked(patientAddress, doctorAddress),
  ];
  const history = (await Promise.all(historyFilters.map((filter) => contract.queryFilter(filter, 0, "latest")))).flat()
    .sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.index - b.index);
  const latest = history.at(-1);
  let status = active ? "active" : "not_granted";
  if (!active && latest) {
    if (["AccessRevoked", "EmergencyAccessRevoked"].includes(latest.fragment.name)) status = "revoked";
    else status = "expired";
  }
  return { active, status, expiresAt: expiry === 0n ? null : Number(expiry) * 1000 };
}

export async function grantDoctorAccess(patientAddress, doctorAddress, expiresAt = null) {
  const { contract } = await getPatientContract(patientAddress);
  return withWalletTransaction(patientAddress, async () => {
  const doctor = await contract.doctors(doctorAddress);
  if (!doctor.registered || !doctor.verified) {
    throw new Error("Dokter belum terdaftar dan terverifikasi pada kontrak di jaringan ini. Muat ulang daftar dokter.");
  }

  const alreadyAllowed = await contract.accessPermissions(patientAddress, doctorAddress);
  if (alreadyAllowed) {
    throw new Error("Akses untuk dokter ini sudah diberikan.");
  }

  // Simulasikan transaksi lebih dulu agar pesan revert dari kontrak tampil jelas.
    const transaction = expiresAt
      ? await (async () => {
          const expiry = BigInt(Math.floor(new Date(expiresAt).getTime() / 1000));
          await contract.grantAccessUntil.staticCall(doctorAddress, expiry);
          return contract.grantAccessUntil(doctorAddress, expiry);
        })()
      : await (async () => {
          await contract.grantAccess.staticCall(doctorAddress);
          return contract.grantAccess(doctorAddress);
        })();
  const receipt = await transaction.wait();
  return { transactionHash: receipt.hash, status: receipt.status };
  });
}

export async function revokeDoctorAccess(patientAddress, doctorAddress) {
  const { contract, walletAddress } = await getPatientContract(patientAddress);
  return withWalletTransaction(walletAddress, async () => {
  const currentlyAllowed = await contract.accessPermissions(walletAddress, doctorAddress);
  if (!currentlyAllowed) {
    throw new Error(
      `Blockchain tidak menemukan izin aktif untuk pasangan ini. Patient wallet: ${walletAddress}; doctor wallet: ${doctorAddress}; contract: ${CONTRACT_ADDRESS}.`
    );
  }
  const [activeAddress] = await window.ethereum.request({ method: "eth_accounts" });
  if (!activeAddress || activeAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("Akun MetaMask berubah sebelum transaksi. Pilih wallet pasien yang sama dan ulangi.");
  }
  // Permission is confirmed above and the signer is matched to the patient.
  // Use an explicit gas limit to skip the contradictory provider simulation.
  const transaction = await contract.revokeAccess(doctorAddress, {
    gasLimit: 100000n,
  });
  const receipt = await transaction.wait();
  return { transactionHash: receipt.hash, status: receipt.status };
  });
}

export function hashMedicalRecordFile(file) {
  if (!file) throw new Error("Pilih file rekam medis terlebih dahulu.");
  return file.arrayBuffer().then((buffer) => ethers.keccak256(new Uint8Array(buffer)));
}

export async function addMedicalRecord(doctorAddress, patientAddress, commitment) {
  const { contract, signer } = await getContract();
  const walletAddress = await signer.getAddress();
  if (walletAddress.toLowerCase() !== doctorAddress.toLowerCase()) {
    throw new Error("Wallet MetaMask tidak sesuai dengan wallet dokter.");
  }
  return withWalletTransaction(walletAddress, async () => {
  const transaction = await contract.addRecord(patientAddress, commitment);
  const receipt = await transaction.wait();
  return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
  });
}

export async function addMedicalRecordVersion(doctorAddress, patientAddress, commitment, previousCommitment) {
  const { contract, signer } = await getContract();
  const walletAddress = await signer.getAddress();
  if (walletAddress.toLowerCase() !== doctorAddress.toLowerCase()) throw new Error("Wallet MetaMask tidak sesuai dengan wallet dokter.");
  return withWalletTransaction(walletAddress, async () => {
    const tx = await contract.addRecordVersion(patientAddress, commitment, previousCommitment);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
  });
}

export async function signMedicalRecord(patientAddress, commitment, transactionHash, previousCommitment = "") {
  const { signer } = await getContract();
  const doctorAddress = await signer.getAddress();
  const message = [
    "MediChain Record Signature",
    `Contract:${CONTRACT_ADDRESS.toLowerCase()}`,
    "ChainId:31337",
    `Patient:${patientAddress.toLowerCase()}`,
    `Doctor:${doctorAddress.toLowerCase()}`,
    `Commitment:${commitment.toLowerCase()}`,
    `Transaction:${transactionHash.toLowerCase()}`,
    `Previous:${previousCommitment.toLowerCase() || "none"}`,
  ].join("\n");
  const signature = await signer.signMessage(message);
  return { signature, doctorAddress, message };
}

export async function grantEmergencyAccess(adminWallet, patientWallet, doctorWallet, hours, reason) {
  const { contract, signer } = await getContract();
  const activeWallet = await signer.getAddress();
  if (activeWallet.toLowerCase() !== adminWallet.toLowerCase()) throw new Error("Wallet MetaMask tidak sesuai dengan wallet admin.");
  return withWalletTransaction(activeWallet, async () => {
    const owner = await contract.owner();
    if (owner.toLowerCase() !== activeWallet.toLowerCase()) throw new Error("Hanya wallet owner kontrak yang dapat menyetujui akses darurat.");
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + Number(hours) * 3600);
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason.trim()));
    const tx = await contract.grantEmergencyAccess(patientWallet, doctorWallet, expiresAt, reasonHash);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash };
  });
}

export async function revokeEmergencyAccess(adminWallet, patientWallet, doctorWallet) {
  const { contract, signer } = await getContract();
  const activeWallet = await signer.getAddress();
  if (activeWallet.toLowerCase() !== adminWallet.toLowerCase()) throw new Error("Wallet MetaMask tidak sesuai dengan wallet admin.");
  return withWalletTransaction(activeWallet, async () => {
    const owner = await contract.owner();
    if (owner.toLowerCase() !== activeWallet.toLowerCase()) throw new Error("Hanya wallet owner kontrak yang dapat mencabut akses darurat.");
    const tx = await contract.revokeEmergencyAccess(patientWallet, doctorWallet);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash };
  });
}

export async function revokeRecordOnBlockchain(adminWallet, patientWallet, commitment, reason) {
  const { contract, signer } = await getContract();
  const activeWallet = await signer.getAddress();
  if (activeWallet.toLowerCase() !== adminWallet.toLowerCase()) throw new Error("Gunakan wallet admin yang terhubung.");
  return withWalletTransaction(activeWallet, async () => {
    const owner = await contract.owner();
    if (owner.toLowerCase() !== activeWallet.toLowerCase()) throw new Error("Wallet admin bukan owner kontrak.");
    const reasonHash = ethers.keccak256(ethers.toUtf8Bytes(reason.trim()));
    const tx = await contract.revokeRecord(patientWallet, commitment, reasonHash);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash };
  });
}

export async function getPatientMedicalRecords(expectedWalletAddress, patientAddress) {
  const contract = await getReadOnlyContract();
  const walletAddress = ethers.getAddress(expectedWalletAddress);
  const count = Number(await contract.getRecordCount.staticCall(patientAddress, { from: walletAddress }));
  const records = await Promise.all(
    Array.from({ length: count }, async (_, index) => {
      const [commitment, uploadedBy, timestamp] = await contract.getRecord.staticCall(
        patientAddress,
        index,
        { from: walletAddress }
      );
      return {
        index,
        commitment,
        uploadedBy,
        timestamp: Number(timestamp),
      };
    })
  );
  return records;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function deriveEncryptionKey(passphrase, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMedicalRecordFile(file, passphrase) {
  if (!passphrase || passphrase.length < 12) {
    throw new Error("Gunakan passphrase minimal 12 karakter dan bagikan ke pasien melalui jalur aman.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const metadataIv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    await file.arrayBuffer()
  );
  const metadataCiphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: metadataIv },
    key,
    new TextEncoder().encode(JSON.stringify({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
    }))
  );
  const envelope = JSON.stringify({
    version: 2,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    metadataIv: bytesToBase64(metadataIv),
    metadata: bytesToBase64(new Uint8Array(metadataCiphertext)),
  });
  return new Blob([envelope], { type: "application/octet-stream" });
}

export async function decryptMedicalRecordFile(encryptedBlob, passphrase, expectedCommitment) {
  const envelope = JSON.parse(await encryptedBlob.text());
  if (![1, 2].includes(envelope.version) || !envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error("Format file terenkripsi tidak dikenali.");
  }
  const salt = base64ToBytes(envelope.salt);
  const iv = base64ToBytes(envelope.iv);
  const key = await deriveEncryptionKey(passphrase, salt);
  let plaintext;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      base64ToBytes(envelope.ciphertext)
    );
  } catch {
    throw new Error("Passphrase salah atau file terenkripsi rusak.");
  }
  const actualCommitment = ethers.keccak256(new Uint8Array(plaintext));
  if (actualCommitment.toLowerCase() !== expectedCommitment.toLowerCase()) {
    throw new Error("Verifikasi integritas gagal: hash file tidak cocok dengan blockchain.");
  }
  let fileName = "medical-record";
  let mimeType = "application/octet-stream";
  if (envelope.version === 2 && envelope.metadataIv && envelope.metadata) {
    try {
      const metadataPlaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBytes(envelope.metadataIv) },
        key,
        base64ToBytes(envelope.metadata)
      );
      const metadata = JSON.parse(new TextDecoder().decode(metadataPlaintext));
      fileName = String(metadata.fileName || fileName)
        .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
        .slice(0, 180) || fileName;
      mimeType = typeof metadata.mimeType === "string" ? metadata.mimeType : mimeType;
    } catch {
      throw new Error("Metadata nama file tidak dapat didekripsi.");
    }
  }
  return { blob: new Blob([plaintext], { type: mimeType }), fileName, mimeType };
}
