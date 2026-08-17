import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../api";

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const refreshProfile = async () => {
    try {
      const { data } = await api.get("/profile");
      setUser(data);
      return data;
    } catch {
      setUser(null);
      return null;
    } finally {
      setLoadingAuth(false);
    }
  };

  useEffect(() => {
    refreshProfile();
  }, []);

  const signin = async (data) => {
    const response = await api.post("/signin", data);
    setUser(response.data);
    return response.data;
  };

  const signup = async (formData) => {
    const response = await api.post("/signup", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    setUser(response.data);
    return response.data;
  };

  const signout = async () => {
    await api.post("/signout");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loadingAuth,
        signin,
        signup,
        signout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
