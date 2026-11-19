// Server-only: team accounts that sign in with a username and password
// (separate from shoppers, who sign in with an email code). Sessions are a
// signed cookie checked against the database on every request, so disabling
// someone or changing their password takes effect immediately.
import { createHmac, createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { db } from "./catalog";

const scrypt = promisify(scryptCb);
const COOKIE = "bb_team";
const SESSION_DAYS = 14;
const MAX_FAILS = 5;
const LOCK_MINUTES = 15;

export const ROLES = ["staff", "admin"];
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
export const MIN_PASSWORD = 8;

// ── Passwords (scrypt, random salt) ───────────────────────────────────────
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return ["scrypt", 16384, 8, 1, salt.toString("base64"), hash.toString("base64")].join("$");
}
export async function checkPassword(password, stored) {
  const [kind, N, r, p, salt, hash] = String(stored || "").split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const want = Buffer.from(hash, "base64");
  const got = await scrypt(String(password), Buffer.from(salt, "base64"), want.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(got, want);
}
// Checked when the username doesn't exist, so a wrong username takes as long as a wrong password.
let dummyHash = null;

// ── Session cookie: id.version.expiry.signature ───────────────────────────
function secret() {
  if (process.env.TEAM_SESSION_SECRET) return process.env.TEAM_SESSION_SECRET;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHash("sha256").update(`bb-team-session:${key}`).digest("hex");
}
const sign = payload => createHmac("sha256", secret()).update(payload).digest("base64url");

function cookie(value, maxAge) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export function teamCookie(member) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  const payload = `${member.id}.${member.session_version}.${exp}`;
  return cookie(`${payload}.${sign(payload)}`, SESSION_DAYS * 86400);
}
export const clearTeamCookie = () => cookie("", 0);

function readToken(req) {
  const raw = (req.headers.cookie || "").split(/;\s*/).find(p => p.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [id, version, exp, sig] = decodeURIComponent(raw.slice(COOKIE.length + 1)).split(".");
  if (!id || !version || !exp || !sig) return null;
  const expect = sign(`${id}.${version}.${exp}`);
  if (sig.length !== expect.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  if (Number(exp) * 1000 < Date.now()) return null;
  return { id, version: Number(version) };
}

// The signed-in team member as a user-like object, or null.
export async function getTeamUser(req) {
  if (!db) return null;
  let t;
  try { t = readToken(req); } catch { return null; }
  if (!t) return null;
  const { data: m } = await db.from("team_members").select("id,username,display_name,role,session_version,disabled").eq("id", t.id).maybeSingle();
  if (!m || m.disabled || m.session_version !== t.version || !ROLES.includes(m.role)) return null;
  return { id: null, team: true, teamId: m.id, username: m.username, name: m.display_name || m.username, email: m.username, role: m.role };
}

// Check a username + password. Returns the member row, or throws with a message
// that doesn't reveal whether the username exists. 5 wrong tries lock the
// account for 15 minutes.
export async function teamLogin(username, password) {
  const u = String(username || "").trim().toLowerCase();
  const { data: m } = USERNAME_RE.test(u)
    ? await db.from("team_members").select("*").eq("username", u).maybeSingle()
    : { data: null };
  if (m?.locked_until && new Date(m.locked_until) > new Date()) {
    const mins = Math.ceil((new Date(m.locked_until) - Date.now()) / 60000);
    throw Object.assign(new Error(`Too many wrong tries. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`), { status: 429 });
  }
  dummyHash ||= await hashPassword(randomBytes(12).toString("hex"));
  const ok = await checkPassword(String(password || ""), m?.password_hash || dummyHash);
  if (!m || !ok || m.disabled) {
    if (m && !ok) {
      const fails = m.failed_logins + 1;
      await db.from("team_members").update(fails >= MAX_FAILS
        ? { failed_logins: 0, locked_until: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }
        : { failed_logins: fails }).eq("id", m.id);
    }
    throw Object.assign(new Error("Wrong username or password."), { status: 401 });
  }
  await db.from("team_members").update({ failed_logins: 0, locked_until: null, last_login_at: new Date().toISOString() }).eq("id", m.id);
  return m;
}
