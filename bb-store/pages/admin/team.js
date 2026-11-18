import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import { AdminGate } from "../../components/TeamLogin";
import { useMe, postJSON, accessOf } from "../../lib/me";

const ROLE_INFO = {
  staff: "Store inventory, recording sales and customer offers.",
  admin: "Everything: packs, pools, balances, payouts, sales. Can't manage the team.",
};
const when = d => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "never");

// Owners only: who can get into the admin pages with a username and password.
export default function TeamPage() {
  const me = useMe();
  const access = accessOf(me);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/team");
    const d = await r.json();
    if (!r.ok) return setError(d.error || "Not allowed");
    setError(""); setData(d);
  }, []);
  useEffect(() => { if (access.owner) load(); }, [access.owner, load]);

  async function act(body, okMsg) {
    setMsg("");
    try { await postJSON("/api/admin/team", body); await load(); setMsg(okMsg); return true; }
    catch (e) { setMsg(`Error: ${e.message}`); return false; }
  }

  if (me.loading) return <Layout title="Team"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;
  if (!access.owner) return <Layout title="Team"><AdminGate need="owner" /></Layout>;

  return (
    <Layout title="Team">
      <section className="wrap section admin team-page">
        <h1 className="page-title">Team</h1>
        <p className="muted">People here sign in with a username and password: tap the logo at the top left 5 times, or open any admin page.
          Only the owners (illestcollect@gmail.com and beardedbeartcg@gmail.com) can open this page. Owners sign in with their email code.</p>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}
        {error && <p className="error">{error}</p>}

        <AddMember onAdd={b => act({ action: "add", ...b }, `${b.username} added. Give them the username and password.`)} />

        <h2 className="sub-title">Accounts</h2>
        {!data ? <p className="muted">Loading…</p> : !data.members.length ? <p className="muted">No team accounts yet.</p> : (
          <div className="team-list">
            {data.members.map(m => <Member key={m.id} m={m} act={act} />)}
          </div>
        )}

        {data && (data.emailAccess.admins.length + data.emailAccess.staff.length + data.emailAccess.owners.length > 0) && (
          <>
            <h2 className="sub-title">Email access (set in Vercel)</h2>
            <p className="muted small">These people sign in with an email code. Change them in Vercel → Settings → Environment Variables (ADMIN_EMAILS, STAFF_EMAILS, OWNER_EMAILS).</p>
            <ul className="small">
              {data.emailAccess.owners.map(e => <li key={`o${e}`}>{e} · owner</li>)}
              {data.emailAccess.admins.map(e => <li key={`a${e}`}>{e} · admin</li>)}
              {data.emailAccess.staff.map(e => <li key={`s${e}`}>{e} · staff</li>)}
            </ul>
          </>
        )}
      </section>
    </Layout>
  );
}

function AddMember({ onAdd }) {
  const blank = { username: "", name: "", password: "", role: "staff" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });
  function suggest() {
    const words = "bear cub grizzly kodiak polar honey maple river cedar storm".split(" ");
    const pick = () => words[crypto.getRandomValues(new Uint32Array(1))[0] % words.length];
    setF({ ...f, password: `${pick()}-${pick()}-${crypto.getRandomValues(new Uint32Array(1))[0] % 9000 + 1000}` });
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    if (await onAdd(f)) setF(blank);
    setBusy(false);
  }
  return (
    <form className="add-card-box team-add" onSubmit={submit}>
      <b>Add someone</b>
      <div className="team-add-grid">
        <label className="field">Username<input className="input" autoCapitalize="none" autoCorrect="off" spellCheck="false" placeholder="e.g. umer" required {...bind("username")} /></label>
        <label className="field">Name (optional)<input className="input" {...bind("name")} /></label>
        <label className="field">Password
          <span className="team-pw"><input className="input" type="text" autoComplete="new-password" minLength={8} required {...bind("password")} /><button type="button" className="btn btn-small btn-ghost-dark" onClick={suggest}>Suggest</button></span>
        </label>
        <label className="field">Access
          <select className="input" {...bind("role")}>
            <option value="staff">Staff (inventory)</option>
            <option value="admin">Admin (everything)</option>
          </select>
        </label>
      </div>
      <p className="muted small">{ROLE_INFO[f.role]}</p>
      <button className="btn" disabled={busy}>{busy ? "Adding…" : "Add"}</button>
    </form>
  );
}

function Member({ m, act }) {
  const [pw, setPw] = useState(null);
  const locked = m.locked_until && new Date(m.locked_until) > new Date();
  return (
    <div className={`team-card${m.disabled ? " off" : ""}`}>
      <div className="team-top">
        <div>
          <b>{m.username}</b>{m.display_name ? <span className="muted"> · {m.display_name}</span> : null}
          <div className="muted small">Last sign-in {when(m.last_login_at)}{m.disabled ? " · disabled" : ""}{locked ? " · locked after wrong passwords" : ""}</div>
        </div>
        <select className="input input-sm" value={m.role} aria-label="Access" onChange={e => act({ action: "set-role", id: m.id, role: e.target.value }, `${m.username} is now ${e.target.value}.`)}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>
      {pw !== null ? (
        <form className="team-pw" onSubmit={async e => { e.preventDefault(); if (await act({ action: "reset-password", id: m.id, password: pw }, `New password set for ${m.username}. They've been signed out everywhere.`)) setPw(null); }}>
          <input className="input input-sm" type="text" autoComplete="new-password" minLength={8} placeholder="New password (8+)" value={pw} onChange={e => setPw(e.target.value)} autoFocus required />
          <button className="btn btn-small">Save</button>
          <button type="button" className="link-button" onClick={() => setPw(null)}>Cancel</button>
        </form>
      ) : (
        <div className="team-actions">
          <button className="btn btn-small btn-ghost-dark" onClick={() => setPw("")}>Reset password</button>
          <button className="btn btn-small btn-ghost-dark" onClick={() => act({ action: "sign-out", id: m.id }, `${m.username} signed out on every device.`)}>Sign out everywhere</button>
          {m.disabled
            ? <button className="btn btn-small btn-ghost-dark" onClick={() => act({ action: "enable", id: m.id }, `${m.username} can sign in again.`)}>Enable</button>
            : <button className="btn btn-small btn-ghost-dark" onClick={() => act({ action: "disable", id: m.id }, `${m.username} is disabled and signed out.`)}>Disable</button>}
          <button className="link-button" onClick={() => window.confirm(`Remove ${m.username} for good?`) && act({ action: "remove", id: m.id }, `${m.username} removed.`)}>Remove</button>
        </div>
      )}
    </div>
  );
}
