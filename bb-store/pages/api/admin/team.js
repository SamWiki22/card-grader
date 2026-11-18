import { randomBytes } from "crypto";
import { requireOwner } from "../../../lib/auth";
import { db } from "../../../lib/catalog";
import { hashPassword, ROLES, USERNAME_RE, MIN_PASSWORD } from "../../../lib/team";

const COLS = "id,username,display_name,role,disabled,last_login_at,locked_until,created_by,created_at";
const now = () => new Date().toISOString();

// Owners only: list, add and manage team accounts (username + password).
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const owner = await requireOwner(req, res);
  if (!owner) return;

  if (req.method === "GET") {
    const { data, error } = await db.from("team_members").select(COLS).order("created_at");
    if (error) return res.status(500).json({ error: error.message.includes("team_members") ? "Run supabase/packs.sql in Supabase first (it adds the team table)." : error.message });
    const list = s => (s || "").split(",").map(x => x.trim()).filter(Boolean);
    return res.json({
      members: data,
      // People who get access from Vercel settings instead (shown, not editable here).
      emailAccess: { admins: list(process.env.ADMIN_EMAILS), staff: list(process.env.STAFF_EMAILS), owners: list(process.env.OWNER_EMAILS) },
    });
  }
  if (req.method !== "POST") return res.status(405).end();

  const b = req.body || {};
  const role = ROLES.includes(b.role) ? b.role : null;
  const password = String(b.password || "");
  const id = String(b.id || "");
  const badPassword = password.length < MIN_PASSWORD ? `Passwords need at least ${MIN_PASSWORD} characters.` : null;
  let q;

  switch (b.action) {
    case "add": {
      const username = String(b.username || "").trim().toLowerCase();
      if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Usernames are 3–30 letters, numbers, dots, dashes or underscores." });
      if (!role) return res.status(400).json({ error: "Pick a role." });
      if (badPassword) return res.status(400).json({ error: badPassword });
      const { error } = await db.from("team_members").insert({
        id: randomBytes(8).toString("hex"), username, role,
        display_name: String(b.name || "").trim().slice(0, 60),
        password_hash: await hashPassword(password), created_by: owner.email,
      });
      if (error?.code === "23505") return res.status(409).json({ error: "That username is taken." });
      if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
      return res.json({ ok: true });
    }
    case "set-role":
      if (!role) return res.status(400).json({ error: "Pick a role." });
      q = db.from("team_members").update({ role, updated_at: now() }).eq("id", id);
      break;
    case "reset-password": {
      if (badPassword) return res.status(400).json({ error: badPassword });
      // A new password also signs them out of every device.
      const { data: m } = await db.from("team_members").select("session_version").eq("id", id).maybeSingle();
      if (!m) return res.status(404).json({ error: "Not found." });
      q = db.from("team_members").update({ password_hash: await hashPassword(password), session_version: m.session_version + 1, failed_logins: 0, locked_until: null, updated_at: now() }).eq("id", id);
      break;
    }
    case "sign-out": {
      const { data: m } = await db.from("team_members").select("session_version").eq("id", id).maybeSingle();
      if (!m) return res.status(404).json({ error: "Not found." });
      q = db.from("team_members").update({ session_version: m.session_version + 1, updated_at: now() }).eq("id", id);
      break;
    }
    case "disable":
    case "enable":
      q = db.from("team_members").update({ disabled: b.action === "disable", locked_until: null, failed_logins: 0, updated_at: now() }).eq("id", id);
      break;
    case "remove":
      q = db.from("team_members").delete().eq("id", id);
      break;
    default:
      return res.status(400).json({ error: "Unknown action." });
  }
  const { error } = await q;
  if (error) { console.error(error); return res.status(500).json({ error: error.message }); }
  res.json({ ok: true });
}
