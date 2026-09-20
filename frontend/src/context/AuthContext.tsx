import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { setClientApiKey } from '../api/client';

/**
 * DEVELOPMENT-ONLY AUTHENTICATION CONTEXT
 *
 * Security Architecture Notice (Phase 24A.2 & Phase 24B Compliance):
 * - Browser Credential Persistence is strictly REJECTED (no localStorage, no sessionStorage).
 * - API credentials (Bearer API keys) are kept in React component state memory ONLY.
 * - Refreshing or closing the browser window intentionally clears the stored key.
 * - Production browser session/auth will be implemented via dedicated BFF/HttpOnly session cookies in future phases.
 */

interface AuthContextType {
  apiKey: string | null;
  isAuthenticated: boolean;
  setApiKey: (key: string | null) => void;
  clearApiKey: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [apiKey, setApiKeyInternal] = useState<string | null>(null);

  const setApiKey = useCallback((key: string | null) => {
    const trimmed = key ? key.trim() : null;
    setApiKeyInternal(trimmed);
    setClientApiKey(trimmed);
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyInternal(null);
    setClientApiKey(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        isAuthenticated: Boolean(apiKey),
        setApiKey,
        clearApiKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
