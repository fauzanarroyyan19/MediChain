
import { createContext, useContext, useState } from "react";
import api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const savedUser = localStorage.getItem("medichain_user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = async (email, password) => {
    const response = await api.post("/auth/login", {
      email,
      password,
    });

    const { token, user } = response.data;

    localStorage.setItem("medichain_token", token);
    localStorage.setItem("medichain_user", JSON.stringify(user));

    setUser(user);
    return user;
  };

  const register = async (formData) => {
    const response = await api.post("/auth/register", formData);
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem("medichain_token");
    localStorage.removeItem("medichain_user");
    setUser(null);
  };

  // Update wallet address setelah berhasil diverifikasi
  const updateWallet = (address) => {
    const updatedUser = {
      ...user,
      wallet_address: address,
    };

    localStorage.setItem(
      "medichain_user",
      JSON.stringify(updatedUser)
    );

    setUser(updatedUser);
  };

  return (
    <AuthContext.Provider
      value={{ user, login, register, logout, updateWallet }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
