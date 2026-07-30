"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type ClientSessionStatus = "loading" | "anonymous" | "authenticated";

type ClientSessionContextValue = {
  shopSlug: string;
  status: ClientSessionStatus;
  whatsapp: string | null;
  setAuthenticated: (whatsapp: string) => void;
  clearSession: () => Promise<void>;
  refresh: () => Promise<void>;
};

const ClientSessionContext =
  createContext<ClientSessionContextValue | null>(null);

export function ClientSessionProvider({
  shopSlug,
  children,
}: {
  shopSlug: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<ClientSessionStatus>("loading");
  const [whatsapp, setWhatsapp] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/agenda/session?shop=${encodeURIComponent(shopSlug)}`,
        { credentials: "include" }
      );
      const body = await res.json().catch(() => ({}));
      if (body.authenticated && typeof body.whatsapp === "string") {
        setWhatsapp(body.whatsapp);
        setStatus("authenticated");
        return;
      }
      setWhatsapp(null);
      setStatus("anonymous");
    } catch {
      setWhatsapp(null);
      setStatus("anonymous");
    }
  }, [shopSlug]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setAuthenticated = useCallback((next: string) => {
    setWhatsapp(next);
    setStatus("authenticated");
  }, []);

  const clearSession = useCallback(async () => {
    try {
      await fetch("/api/agenda/session", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // ainda limpa o estado local
    }
    setWhatsapp(null);
    setStatus("anonymous");
  }, []);

  const value = useMemo(
    () => ({
      shopSlug,
      status,
      whatsapp,
      setAuthenticated,
      clearSession,
      refresh,
    }),
    [shopSlug, status, whatsapp, setAuthenticated, clearSession, refresh]
  );

  return (
    <ClientSessionContext.Provider value={value}>
      {children}
    </ClientSessionContext.Provider>
  );
}

export function useClientSession(): ClientSessionContextValue {
  const ctx = useContext(ClientSessionContext);
  if (!ctx) {
    throw new Error(
      "useClientSession deve ser usado dentro de ClientSessionProvider."
    );
  }
  return ctx;
}
