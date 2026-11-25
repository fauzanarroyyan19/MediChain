
import { ethers } from "ethers";
import api from "./api";

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask belum terpasang.");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);

  await provider.send("eth_requestAccounts", []);

  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();

  if (network.chainId !== 31337n) {
    throw new Error("Silakan gunakan jaringan Hardhat Local.");
  }

  return { address, signer, provider };
}

export async function linkWallet() {
  // Hubungkan MetaMask
  const { address, signer } = await connectWallet();

  // Minta pesan unik dari backend
  const challengeResponse = await api.post("/wallet/challenge");

  const message = challengeResponse.data.signingMessage;

  // Pengguna menandatangani pesan melalui MetaMask
  const signature = await signer.signMessage(message);

  // Kirim alamat dan signature untuk diverifikasi backend
  const verificationResponse = await api.post("/wallet/verify", {
    address,
    signature,
  });

  return verificationResponse.data.wallet_address;
}
