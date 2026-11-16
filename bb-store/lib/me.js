import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Who's signed in and their pack balance. The server is the source of truth;
// this just caches /api/auth/me for the header and pack pages.
const MeContext = createContext(null);

export function MeProvider({ children }) {
  const [me, setMe] = useState({ loading: true, user: null, ready: false, balance_cents: 0 });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      const data = await r.json();
      setMe({ loading: false, ready: !!data.ready, user: data.user, balance_cents: data.balance_cents || 0 });
    } catch {
      setMe(m => ({ ...m, loading: false }));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const setBalance = useCallback(balance_cents => setMe(m => ({ ...m, balance_cents })), []);
  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
  }, [refresh]);

  return <MeContext.Provider value={{ ...me, refresh, setBalance, signOut }}>{children}</MeContext.Provider>;
}

export const useMe = () => useContext(MeContext);

export async function postJSON(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: r.status });
  return data;
}
