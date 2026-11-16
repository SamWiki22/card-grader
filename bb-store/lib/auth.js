// Server-only sign-in helpers. Shoppers sign in with a 6-digit email code; the
// Supabase session is kept in httpOnly cookies so no database key ever reaches
// the browser (the inventory tables accept writes with the anon key).
import { createClient } from "@supabase/supabase-js";
import { db } from "./catalog";

const AT = "bb_at";
const RT = "bb_rt";

// A throwaway client per call: verifying or refreshing a session on the shared
// service-role client would make its later queries run as that shopper.
function authClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export const packsReady = () => !!(db && process.env.SUPABASE_SERVICE_ROLE_KEY);

function cookie(name, value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function readCookies(req) {
  return Object.fromEntries((req.headers.cookie || "").split(/;\s*/).filter(Boolean).map(p => {
    const i = p.indexOf("=");
    return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))];
  }));
}

export function setSession(res, session) {
  res.setHeader("Set-Cookie", [cookie(AT, session.access_token, session.expires_in || 3600), cookie(RT, session.refresh_token, 60 * 60 * 24 * 30)]);
}
export function clearSession(res) {
  res.setHeader("Set-Cookie", [cookie(AT, "", 0), cookie(RT, "", 0)]);
}

export async function sendCode(email) {
  const { error } = await authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email, token) {
  const { data, error } = await authClient().auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.session) throw error || new Error("No session");
  return data;
}

// Returns the signed-in user (refreshing an expired access token when it can), or null.
export async function getUser(req, res) {
  if (!packsReady()) return null;
  const c = readCookies(req);
  const client = authClient();
  if (c[AT]) {
    const { data } = await client.auth.getUser(c[AT]);
    if (data?.user) return data.user;
  }
  if (c[RT]) {
    const { data } = await client.auth.refreshSession({ refresh_token: c[RT] });
    if (data?.session && data.user) {
      if (res) setSession(res, data.session);
      return data.user;
    }
  }
  return null;
}

export function isAdmin(user) {
  const admins = (process.env.ADMIN_EMAILS || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return !!user?.email && admins.includes(user.email.toLowerCase());
}

// API helpers: respond with an error and return null when not allowed.
export async function requireUser(req, res) {
  if (!packsReady()) { res.status(503).json({ error: "Packs aren’t set up yet." }); return null; }
  const user = await getUser(req, res);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return null; }
  return user;
}
export async function requireAdmin(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdmin(user)) { res.status(403).json({ error: "Admins only." }); return null; }
  return user;
}

// Turns "INSUFFICIENT_FUNDS" style database exceptions into shopper-friendly text.
const MESSAGES = {
  INSUFFICIENT_FUNDS: "Not enough balance — add funds to keep going.",
  POOL_EMPTY: "This pack is being restocked. Try another tier!",
  TIER_UNAVAILABLE: "That pack isn’t available right now.",
  NOT_YOURS: "That card isn’t in your vault anymore.",
  NO_CARDS: "Pick at least one card.",
  NO_PROFILE: "Please sign in again.",
  NOT_ACCEPTED: "That submission isn’t waiting to be paid.",
};
export function friendlyError(error) {
  const code = Object.keys(MESSAGES).find(k => (error?.message || "").includes(k));
  return code ? { status: code === "INSUFFICIENT_FUNDS" ? 402 : 409, message: MESSAGES[code] } : null;
}
