import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { setClientApiKey, setClientCsrfToken } from '../api/client';
import { sessionApi } from '../api/endpoints/session';

/**
 * PRODUCTION AUTHENTICATION CONTEXT (Phase 24F)
 *
 * Security Architecture Notice:
 * - Browser Credential Persistence is strictly REJECTED (no localStorage, no sessionStorage).
 * - Web UI uses HttpOnly + SameSite session cookies for credential persistence.
 * - CSRF token is kept strictly in React memory (and setClientCsrfToken).
 * - Programmatic API key state is optional and strictly transient.
 */

interface AuthContextType {
  userId: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  csrfToken: string | null;
  apiKey: string | null;
  login: (apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
  setApiKey: (key: string | null) => void;
  clearApiKey: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfTokenState] = useState<string | null>(null);
  const [apiKey, setApiKeyInternal] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const setCsrfToken = useCallback((token: string | null) => {
    setCsrfTokenState(token);
    setClientCsrfToken(token);
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    const trimmed = key ? key.trim() : null;
    setApiKeyInternal(trimmed);
    setClientApiKey(trimmed);
    if (trimmed) {
      setIsAuthenticated(true);
    } else if (!userId) {
      setIsAuthenticated(false);
    }
  }, [userId]);

  // Session hydration on initial app mount
  useEffect(() => {
    let isMounted = true;
    sessionApi.getSession()
      .then((res) => {
        if (isMounted) {
          if (res.authenticated && res.user_id && res.csrf_token) {
            setUserId(res.user_id);
            setCsrfToken(res.csrf_token);
            setIsAuthenticated(true);
          } else {
            setIsAuthenticated(false);
          }
        }
      })
      .catch(() => {
        if (isMounted) {
          setIsAuthenticated(false);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [setCsrfToken]);

  const login = useCallback(async (key: string) => {
    const res = await sessionApi.createSession(key);
    setUserId(res.user_id);
    setCsrfToken(res.csrf_token);
    setIsAuthenticated(true);
    // Ensure raw key is cleared from memory context after session creation
    setApiKeyInternal(null);
    setClientApiKey(null);
  }, [setCsrfToken]);

  const logout = useCallback(async () => {
    try {
      await sessionApi.deleteSession();
    } catch {
      // Ignore network errors on logout
    } finally {
      setUserId(null);
      setCsrfToken(null);
      setApiKeyInternal(null);
      setClientApiKey(null);
      setIsAuthenticated(false);
    }
  }, [setCsrfToken]);

  const clearApiKey = useCallback(() => {
    logout();
  }, [logout]);

  return (
    <AuthContext.Provider
      value={{
        userId,
        isAuthenticated,
        isLoading,
        csrfToken,
        apiKey,
        login,
        logout,
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
