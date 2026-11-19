import { createContext, useCallback, useContext, useEffect, useState } from "react";

// Who's signed in and their pack balance. The server is the source of truth;
// this just caches /api/auth/me for the header and pack pages.
const MeContext = createContext(null);

export function MeProvider({ children }) {
  const [me, setMe] = useState({ loading: true, user: null, team: null, ready: false, balance_cents: 0 });

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      const data = await r.json();
      setMe({ loading: false, ready: !!data.ready, user: data.user, team: data.team || null, balance_cents: data.balance_cents || 0, pending_offers: data.pending_offers || 0, new_customer_offers: data.new_customer_offers || 0 });
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

// What the signed-in person can open, whether they signed in with an email
// code (me.user) or a team username/password (me.team).
export const accessOf = me => ({
  signedIn: !!(me.user || me.team),
  staff: !!(me.user?.staff || me.team?.staff),
  admin: !!(me.user?.admin || me.team?.admin),
  owner: !!me.user?.owner,
});
