import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import SignIn from "../components/SignIn";
import TcgPicker from "../components/TcgPicker";
import { useMe, postJSON } from "../lib/me";
import { GAMES, GAME_SHORT, GAME_COLOR, GRADE_OPTIONS, centsToMoney } from "../lib/shared";

const FOCUS = GAMES.filter(g => ["pokemon", "mtg", "dbs", "onepiece"].includes(g.id));
const STATUS = {
  submitted: { label: "Under review", tone: "wait" },
  offered: { label: "Offer ready", tone: "act" },
  accepted: { label: "Ship it to us", tone: "act" },
  paid: { label: "Paid", tone: "done" },
  declined: { label: "You declined", tone: "off" },
  rejected: { label: "Not accepted", tone: "off" },
  vaulted: { label: "In your vault", tone: "done" },
};
// Cards mailed in to keep in the vault use a different label while we wait for them.
const statusOf = s => (s.kind === "vault" && s.status === "accepted" ? { label: "Mail it in", tone: "act" } : STATUS[s.status]);

// Shrink a phone photo to max 1400px JPEG so uploads stay quick.
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 1400 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export default function Sell() {
  const me = useMe();
  const [data, setData] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [signin, setSignin] = useState(false);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/submissions");
    if (r.ok) setData(await r.json());
  }, []);
  useEffect(() => { if (me.user) load(); }, [me.user, load]);

  async function respond(id, accept) {
    setBusyId(id); setMsg("");
    try {
      await postJSON("/api/submissions/respond", { id, accept });
      setMsg(accept ? `Offer accepted! Ship ${id} to us using the address below.` : "Offer declined.");
      await load(); me.refresh();
    } catch (e) { setMsg(e.message); }
    setBusyId("");
  }

  const subs = data?.submissions || [];
  const accepted = subs.filter(s => s.status === "accepted");

  return (
    <AppShell title="Sell your cards">
      <div className="app-head">
        <h1>Sell to the Bear</h1>
        <p className="dim">Send us your cards for pack credit, or mail them in to keep in your vault. Vault cards can be sold back to us or into a pack pool any time.</p>
      </div>

      {showForm !== "vault" && <ol className="steps">
        <li><b>Submit</b><span>Photos, name and grade.</span></li>
        <li><b>Get an offer</b><span>We price it against TCGplayer and recent sales.</span></li>
        <li><b>Ship it</b><span>Accept, then mail the card in with your code.</span></li>
        <li><b>Get paid</b><span>Credit lands in your balance when it arrives.</span></li>
      </ol>}

      {!me.loading && !me.user ? (
        <div className="app-empty small-empty">
          <p>Sign in to submit cards.</p>
          {me.ready && <button className="buy-btn narrow" onClick={() => setSignin(true)}><span>Sign in</span></button>}
        </div>
      ) : showForm ? (
        <SubmitForm kind={showForm} onCancel={() => setShowForm(false)} onDone={async (id, kind) => {
          setShowForm(false);
          setMsg(kind === "vault" ? `Added! Mail the card in with code ${id} (address below). It’s in your vault now, locked until it arrives.` : `Got it! Submission ${id} is under review — we’ll post an offer here.`);
          await load();
        }} />
      ) : (
        <div className="sell-choices">
          <button className="buy-btn" onClick={() => { setShowForm("sale"); setMsg(""); }}><span>+ Get an offer</span></button>
          <button className="ghost-btn" onClick={() => { setShowForm("vault"); setMsg(""); }}>+ Add a card to my vault</button>
        </div>
      )}

      {msg && <p className="app-banner" style={{ marginTop: 14 }}>{msg}</p>}

      {accepted.length > 0 && (
        <section className="ship-to">
          <h2>Mail these cards to</h2>
          {data.shipTo.length ? <address>{data.shipTo.map((l, i) => <span key={i}>{l}<br /></span>)}</address> : <p className="dim">We’ll email you our shipping address.</p>}
          <p className="dim small">Put each card in a sleeve and toploader (or keep slabs in a protective sleeve). Write the code on a note inside: {accepted.map(s => s.id).join(", ")}.</p>
        </section>
      )}

      {me.user && (
        <section className="app-section">
          <h2>Your submissions</h2>
          {!data ? <p className="dim">Loading…</p> : !subs.length ? <p className="dim">Nothing submitted yet.</p> : (
            <ul className="sub-list">
              {subs.map(s => (
                <li key={s.id} className={`sub-item tone-${statusOf(s)?.tone}`}>
                  <img src={`/api/submission-photo/${encodeURIComponent(s.id)}`} alt="" />
                  <div className="sub-body">
                    <div className="sub-top"><b>{s.name}</b><span className="sub-status">{statusOf(s)?.label || s.status}</span></div>
                    <div className="dim small">{[GAME_SHORT[s.game], s.set_name, s.card_number, s.grade].filter(Boolean).join(" · ")}</div>
                    <div className="dim small">Code <b className="code">{s.id}</b>{s.asking_cents ? ` · You asked ${centsToMoney(s.asking_cents)}` : ""}</div>
                    {s.offer_cents != null && ["offered", "accepted", "paid"].includes(s.status) && (
                      <div className="sub-offer">Our offer: <b>{centsToMoney(s.offer_cents)}</b> in pack credit</div>
                    )}
                    {s.admin_note && <div className="dim small">“{s.admin_note}”</div>}
                    {s.status === "offered" && (
                      <div className="sub-actions">
                        <button className="sell-btn" disabled={busyId === s.id} onClick={() => respond(s.id, true)}>Accept {centsToMoney(s.offer_cents)}</button>
                        <button className="ghost-btn" disabled={busyId === s.id} onClick={() => respond(s.id, false)}>Decline</button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p className="dim small" style={{ marginTop: 24 }}>Payment is pack credit you can use on <Link href="/packs" className="text-link">Packs</Link>. Cards must be authentic and match the photos; we may revise or cancel an offer if the card arrives in different condition.</p>
      {signin && <SignIn onClose={() => setSignin(false)} reason="Sign in to sell cards to Bearded Bear." />}
    </AppShell>
  );
}

function SubmitForm({ kind = "sale", onCancel, onDone }) {
  const vault = kind === "vault";
  const [f, setF] = useState({ kind, game: "pokemon", name: "", set_name: "", card_number: "", grade: "Raw NM", asking: "", note: "", photo_front: "", photo_back: "", tcg: null });
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  async function onPhoto(side, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try { const url = await compress(file); setF(cur => ({ ...cur, [side]: url })); }
    catch { setError("That photo couldn’t be read — try another."); }
  }
  async function submit(e) {
    e.preventDefault();
    if (!f.photo_front) return setError("Add a photo of the front of the card.");
    setBusy(true); setError("");
    try { const r = await postJSON("/api/submissions", f); onDone(r.id, kind); }
    catch (err) { setError(err.message); setBusy(false); }
  }

  return (
    <form className="submit-form" onSubmit={submit}>
      <p className="dim small">{vault
        ? "Add a card you own. It shows in your vault right away, locked until it reaches us and we check it matches the photos. Then you can keep it, ship it home, or sell it to us or into a pack pool."
        : "Tell us about the card and we’ll make you an offer in pack credit."}</p>
      <div className="seg" role="group" aria-label="Game">
        {FOCUS.map(g => (
          <button type="button" key={g.id} className={`seg-btn${f.game === g.id ? " on" : ""}`} style={{ "--g": GAME_COLOR[g.id] }} onClick={() => setF({ ...f, game: g.id, tcg: null })}>
            <span className="seg-swatch" />{g.short}
          </button>
        ))}
      </div>

      <button type="button" className="ghost-btn" onClick={() => setPicker(true)}>
        {f.tcg ? `✓ Matched on TCGplayer · ${f.tcg.subType} · ${centsToMoney(f.tcg.cents)}` : "Find my card on TCGplayer (optional, faster offers)"}
      </button>

      <label className="field">Card name<input className="input" required {...bind("name")} placeholder="e.g. Charizard ex" /></label>
      <div className="two">
        <label className="field">Set<input className="input" {...bind("set_name")} /></label>
        <label className="field">Card #<input className="input" {...bind("card_number")} placeholder="199/165" /></label>
      </div>
      <div className="two">
        <label className="field">Condition / grade
          <input className="input" list="grades" {...bind("grade")} />
          <datalist id="grades">{GRADE_OPTIONS.map(g => <option key={g} value={g} />)}</datalist>
        </label>
        {!vault && <label className="field">Asking price (optional)<input className="input" type="number" min="0" step="0.01" placeholder="$" {...bind("asking")} /></label>}
      </div>
      <div className="two">
        <PhotoBox label="Front photo" required value={f.photo_front} onChange={e => onPhoto("photo_front", e)} />
        <PhotoBox label="Back photo" value={f.photo_back} onChange={e => onPhoto("photo_back", e)} />
      </div>
      <label className="field">Anything we should know?<textarea className="input" rows={2} maxLength={500} {...bind("note")} placeholder="Cert number, whitening, centering…" /></label>
      {error && <p className="buy-error">{error}</p>}
      <button className="buy-btn" disabled={busy}><span>{busy ? "Sending…" : vault ? "Add to my vault" : "Submit for an offer"}</span></button>
      <button type="button" className="ghost-btn" onClick={onCancel}>Cancel</button>

      {picker && (
        <TcgPicker initialGame={f.game} showSync={false} title="Find your card" onClose={() => setPicker(false)}
          onPick={t => { setPicker(false); setF(cur => ({ ...cur, name: t.name, set_name: t.setName, card_number: t.number, tcg: t })); }} />
      )}
    </form>
  );
}

function PhotoBox({ label, value, onChange, required }) {
  return (
    <label className={`photo-box${value ? " has" : ""}`}>
      {value ? <img src={value} alt="" /> : <span>{label}{required ? " *" : ""}<br /><small>Tap to add</small></span>}
      <input type="file" accept="image/*" capture="environment" onChange={onChange} hidden />
    </label>
  );
}
