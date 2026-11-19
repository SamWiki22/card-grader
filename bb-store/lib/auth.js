// Server-only sign-in helpers. Shoppers sign in with a 6-digit email code; the
// Supabase session is kept in httpOnly cookies so no database key ever reaches
// the browser (the inventory tables accept writes with the anon key).
import { createClient } from "@supabase/supabase-js";
import { db } from "./catalog";
import { getTeamUser, clearTeamCookie } from "./team";

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
  res.setHeader("Set-Cookie", [cookie(AT, "", 0), cookie(RT, "", 0), clearTeamCookie()]);
}

// Emails a sign-in link (Supabase's default email) — or a 6-digit code if the
// email template includes {{ .Token }}. The link lands on /auth/callback.
export async function sendCode(email, redirectTo, createUser = true) {
  const { error } = await authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: createUser, emailRedirectTo: redirectTo } });
  if (error) throw error;
}

// ── Email + password ──────────────────────────────────────────────────────
export const MIN_PASSWORD = 8;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

// Log in with email + password. 5 wrong passwords lock that email's password
// login for 15 minutes (the email code still works).
export async function passwordLogin(email, password) {
  const { data: f } = await db.from("login_failures").select("fails,locked_until").eq("email", email).maybeSingle();
  if (f?.locked_until && new Date(f.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(f.locked_until) - Date.now()) / 60000);
    throw Object.assign(new Error(`Too many wrong passwords. Try again in ${mins} minute${mins === 1 ? "" : "s"}, or use “Forgot password”.`), { status: 429 });
  }
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    const fails = (f?.fails || 0) + 1;
    await db.from("login_failures").upsert(fails >= MAX_FAILS
      ? { email, fails: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }
      : { email, fails, locked_until: null });
    throw Object.assign(new Error("Wrong email or password."), { status: 401 });
  }
  if (f) await db.from("login_failures").delete().eq("email", email);
  return data;
}

// Set (or change) a signed-in shopper's password.
export async function setPassword(userId, password) {
  const { error } = await authClient().auth.admin.updateUserById(userId, { password });
  if (error) throw error;
  await db.from("profiles").update({ has_password: true }).eq("user_id", userId);
}

export async function verifyCode(email, token) {
  const { data, error } = await authClient().auth.verifyOtp({ email, token, type: "email" });
  if (error || !data.session) throw error || new Error("No session");
  return data;
}

// Signs in from the tokens a sign-in link hands to /auth/callback.
export async function sessionFromTokens(access_token, refresh_token) {
  const client = authClient();
  const { data } = await client.auth.getUser(access_token);
  if (!data?.user) throw new Error("Invalid sign-in link");
  const { data: s } = await client.auth.refreshSession({ refresh_token });
  if (!s?.session || s.user?.id !== data.user.id) throw new Error("Invalid sign-in link");
  return { session: s.session, user: s.user };
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

const emailIn = (user, list) => {
  const emails = (list || "").toLowerCase().split(",").map(s => s.trim()).filter(Boolean);
  return !!user?.email && !user.team && emails.includes(user.email.toLowerCase());
};

// Owners have master control: everything admins can do, plus adding and
// removing team members in /admin/team. They sign in with their email code.
// Built in so they can never be locked out; OWNER_EMAILS in Vercel can add more.
const BUILT_IN_OWNERS = "illestcollect@gmail.com,beardedbeartcg@gmail.com";
export const isOwner = user => emailIn(user, BUILT_IN_OWNERS) || emailIn(user, process.env.OWNER_EMAILS);

// Admins: owners, ADMIN_EMAILS, and team members with the admin role.
// Staff (store inventory, sales, offers): STAFF_EMAILS and team members with the staff role.
export function isAdmin(user) {
  if (!user) return false;
  if (user.team) return user.role === "admin";
  return isOwner(user) || emailIn(user, process.env.ADMIN_EMAILS);
}
export function isStaff(user) {
  if (!user) return false;
  if (user.team) return user.role === "admin" || user.role === "staff";
  return isAdmin(user) || emailIn(user, process.env.STAFF_EMAILS);
}

// API helpers: respond with an error and return null when not allowed.
export async function requireUser(req, res) {
  if (!packsReady()) { res.status(503).json({ error: "Packs aren’t set up yet." }); return null; }
  const user = await getUser(req, res);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return null; }
  return user;
}
// Team pages accept a username/password team session or an email sign-in.
async function requireRole(req, res, allowed, deny) {
  if (!packsReady()) { res.status(503).json({ error: "Not set up yet." }); return null; }
  const [team, user] = await Promise.all([getTeamUser(req), getUser(req, res)]);
  const who = [user, team].find(u => u && allowed(u));
  if (who) return who;
  res.status(team || user ? 403 : 401).json({ error: team || user ? deny : "Please sign in." });
  return null;
}
export const requireStaff = (req, res) => requireRole(req, res, isStaff, "Staff only.");
export const requireAdmin = (req, res) => requireRole(req, res, isAdmin, "Admins only.");
export const requireOwner = (req, res) => requireRole(req, res, isOwner, "Only the owners can manage the team.");

// Turns "INSUFFICIENT_FUNDS" style database exceptions into shopper-friendly text.
const MESSAGES = {
  INSUFFICIENT_FUNDS: "Not enough balance — add funds to keep going.",
  POOL_EMPTY: "This pack is being restocked. Try another tier!",
  TIER_UNAVAILABLE: "That pack isn’t available right now.",
  POOL_CHANGED: "The pool changed while your pack was opening. You weren’t charged — try again.",
  NOT_YOURS: "That card isn’t in your vault anymore.",
  NO_CARDS: "Pick at least one card.",
  NO_PROFILE: "Please sign in again.",
  NOT_ACCEPTED: "That submission isn’t waiting to be paid.",
};
export function friendlyError(error) {
  const code = Object.keys(MESSAGES).find(k => (error?.message || "").includes(k));
  return code ? { status: code === "INSUFFICIENT_FUNDS" ? 402 : 409, message: MESSAGES[code] } : null;
}
