import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FillNumbers from "../../components/FillNumbers";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { AdminGate } from "../../components/TeamLogin";
import TcgPicker from "../../components/TcgPicker";
import Modal from "../../components/Modal";
import PhotoPass from "../../components/PhotoPass";
import PackPreview from "../../components/PackPreview";
import { useMe, postJSON } from "../../lib/me";
import { shrink, cardPhotoUrl } from "../../lib/photo";
import { GAMES, GAME_LABEL, GAME_SHORT, COMP_SOURCES, centsToMoney, money } from "../../lib/shared";
import { balanceWeights, expectedValue, oddsFor, DEFAULT_TARGET_MARGIN } from "../../lib/odds";

const pct = n => `${(n * 100).toFixed(1)}%`;
const LAST_POOL = "bb-admin-pool";
// TCGplayer category → game, to warn when a card is being added to another game's pool.
const TCG_GAME = { 3: "pokemon", 1: "mtg", 80: "dbs", 27: "dbs", 68: "onepiece", 86: "gundam", 81: "unionarena", 89: "riftbound" };
const STATUS = { available: "In pool", held: "In a vault", ship_requested: "To ship", shipped: "Shipped", retired: "Pulled from pool" };

// Resize a photo to max 900px JPEG before upload so pack pools stay light.
function compress(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
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

// Same as the server: card override, else the highest rule the value reaches.
function ruleFor(valueCents, rules) {
  let p = rules[0]?.percent ?? 75;
  for (const r of rules) if (valueCents >= r.min_value_cents) p = r.percent;
  return p;
}

// On phones, admin tables become stacked cards: copy each column heading onto
// its cells so CSS can show "Price · $10" style labels.
function useTableLabels() {
  useEffect(() => {
    for (const table of document.querySelectorAll(".admin .table")) {
      const heads = [...table.querySelectorAll("thead th")].map(th => th.textContent.trim());
      for (const tr of table.querySelectorAll("tbody tr")) {
        [...tr.children].forEach((td, i) => { if (heads[i]) td.setAttribute("data-label", heads[i]); else td.removeAttribute("data-label"); });
      }
    }
  });
}

export default function AdminPacks() {
  useTableLabels();
  const me = useMe();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState("");
  const [tierId, setTierId] = useState("");
  const [msg, setMsg] = useState("");
  const [picker, setPicker] = useState(null); // { game, onPick }
  const [comp, setComp] = useState(null);     // { target, row }

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/packs");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setData(d);
    let last = "";
    try { last = localStorage.getItem(LAST_POOL) || ""; } catch {}
    setTierId(t => t || (d.tiers.some(x => x.id === last) ? last : "") || d.tiers.find(x => x.active)?.id || d.tiers[0]?.id || "");
  }, []);
  useEffect(() => { if (me.user || me.team) load(); }, [me.user, me.team, load]);

  async function act(body, okMsg) {
    setMsg("");
    try {
      const r = await postJSON("/api/admin/packs", body);
      await load();
      if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg);
      return true;
    } catch (e) { setMsg(`Error: ${e.message}`); return false; }
  }
  const pick = (game, onPick, opts = {}) => setPicker({ game, ...opts, onPick: t => { setPicker(null); onPick(t); } });

  if (!me.loading && !me.user && !me.team) return <Layout title="Admin"><AdminGate /></Layout>;
  if (denied) return <Layout title="Admin"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!data) return <Layout title="Admin"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const tier = data.tiers.find(t => t.id === tierId);
  const choosePool = id => { setTierId(id); try { localStorage.setItem(LAST_POOL, id); } catch {} };
  const cards = data.cards.filter(c => c.tier_id === tierId);
  const openShipments = data.shipments.filter(s => s.status === "requested");
  const synced = data.cards.filter(c => c.price_source === "tcgplayer").length + data.items.filter(i => i.price_source === "tcgplayer").length;

  return (
    <Layout title="Packs admin">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Packs admin</h1>
          <a href="/admin/store" className="btn btn-small btn-ghost-dark">Store inventory →</a>
          <button className="btn btn-small btn-ghost-dark" onClick={() => act({ action: "refresh-prices" }, r => `TCGplayer prices refreshed: ${r.updated} updated, ${r.unchanged} unchanged${r.missing ? `, ${r.missing} with no price` : ""}.`)}>
            Refresh TCGplayer prices ({synced} synced)
          </button>
        </div>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}
        <FillNumbers where="pools" onDone={async m => { await load(); setMsg(m); }} />

        <GiveCredit act={act} />

        <Submissions subs={data.submissions} tiers={data.tiers} rules={data.rules} act={act} />

        <h2 className="sub-title">Tiers</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Game</th><th>Tier</th><th>Price</th><th>Pool</th><th>Avg pull value</th><th>House margin</th><th>Live</th><th /></tr></thead>
            <tbody>
              {data.tiers.map(t => <TierRow key={t.id} t={t} active={t.id === tierId} onPick={() => choosePool(t.id)} onSave={b => act({ action: "update-tier", id: t.id, ...b }, "Tier saved.")} />)}
            </tbody>
          </table>
        </div>
        <p className="muted small">House margin = 1 − (average card value pulled ÷ pack price). Below ~10% you’re likely losing money after shipping and fees.</p>

        <BuybackRules rules={data.rules} onSave={rules => act({ action: "save-buyback-rules", rules }, "Buyback rates saved.")} />

        <PoolSearch cards={data.cards} tiers={data.tiers} onOpen={choosePool} />

        {tier && (
          <>
            <div className="pool-head-row">
              <h2 className="sub-title">{GAME_LABEL[tier.game]} · {tier.name} pool</h2>
              <select className="input pool-switch" value={tierId} onChange={e => choosePool(e.target.value)} aria-label="Switch pool">
                {data.tiers.map(t => <option key={t.id} value={t.id}>{GAME_LABEL[t.game]} · {t.name} ({t.poolSize} cards)</option>)}
              </select>
            </div>
            <BalancePool tier={tier} cards={cards} act={act} />
            <div className="pool-tools">
              <PhotoPass tier={tier} cards={cards} onDone={m => { load(); setMsg(m); }} />
              <PackPreview tier={tier} cards={cards} />
            </div>
            <ImportPool tier={tier} act={act} allCards={data.cards} />
            <AddCard tier={tier} tiers={data.tiers} onPool={choosePool} pick={pick} onAdd={async b => {
              try { await postJSON("/api/admin/packs", { action: "add-card", tier_id: tier.id, ...b }); await load(); return { ok: true }; }
              catch (e) { return { error: e.message }; }
            }} />
            <PoolCounts cards={cards} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Card</th><th>Grade</th><th>Value</th><th>Buyback</th><th>Weight</th><th>Chance</th><th>TCGplayer</th><th>Last sold</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {cards.map(c => <CardRow key={c.id} c={c} tiers={data.tiers} rules={data.rules} total={cards.filter(x => x.status === "available").reduce((s, x) => s + Number(x.weight), 0)}
                    onSave={b => (b.photo ? act({ action: "set-card-photo", id: c.id, image: b.photo }, `Photo saved for ${c.name}.`) : act({ action: "update-card", id: c.id, ...b }, "Card updated."))}
                    onLink={() => pick(tier.game, t => act({ action: "link-tcg", target: "pack", id: c.id, tcg: t }, `Linked to TCGplayer${t.autoPrice ? " — price now follows market" : ""}.`))}
                    onUnlink={() => act({ action: "unlink-tcg", target: "pack", id: c.id }, "TCGplayer link removed; price is manual.")}
                    onComp={() => setComp({ target: "pack", row: c })} />)}
                  {!cards.length && <tr><td colSpan={10} className="muted">No cards in this pool yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="sub-title">Store singles → packs · TCGplayer pricing</h2>
        <p className="muted small">Every single in your inventory. Tap <b>→ Pack</b> to move copies into a pack pool (they come out of store stock). Link one to TCGplayer and tick “sync” to have its price follow the market daily.</p>
        <SinglesFilter items={data.items} game={tier?.game} render={list => (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Card</th><th>Cond.</th><th>Qty</th><th>Store price</th><th>TCGplayer</th><th>Last sold</th><th /></tr></thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id}>
                  <td>{i.name}<div className="muted small">{i.set_name}</div></td>
                  <td>{i.condition}</td>
                  <td>{i.quantity}</td>
                  <td>{centsToMoney(Math.round(Number(i.price) * 100))}</td>
                  <td><TcgStatus row={i} /></td>
                  <td><CompCell row={i} onEdit={() => setComp({ target: "item", row: i })} /></td>
                  <td className="nowrap">
                    <MoveToPool item={i} tiers={data.tiers} current={tierId} act={act} />{" "}
                    <button className="btn btn-small btn-ghost-dark" onClick={() => pick(i.game || "pokemon", t => act({ action: "link-tcg", target: "item", id: i.id, tcg: t }, `${i.name} linked${t.autoPrice ? " — store price now follows TCGplayer" : ""}.`))}>{i.tcg_product_id ? "Relink" : "Link"}</button>{" "}
                    {i.tcg_product_id && <button className="link-button" onClick={() => act({ action: "unlink-tcg", target: "item", id: i.id }, "Link removed.")}>Unlink</button>}
                  </td>
                </tr>
              ))}
              {!list.length && <tr><td colSpan={7} className="muted">{data.items.length ? "No singles match." : "No singles in inventory yet."}</td></tr>}
            </tbody>
          </table>
        </div>
        )} />

        <h2 className="sub-title">Shipping requests ({openShipments.length})</h2>
        {!openShipments.length ? <p className="muted">Nothing to ship.</p> : openShipments.map(s => (
          <Shipment key={s.id} s={s} onShip={tracking => act({ action: "mark-shipped", id: s.id, tracking }, `Shipment #${s.id} marked shipped.`)} />
        ))}
      </section>
      {comp && <CompEditor {...comp} onClose={() => setComp(null)} onSave={async b => { if (await act({ action: "save-comp", target: comp.target, id: comp.row.id, ...b }, "Last sale saved.")) setComp(null); }} />}
      {picker && <TcgPicker sources={data.tcgSources} initialGame={picker.game} initialQuery={picker.initialQuery || ""} initialSetFilter={picker.initialSetFilter || ""} onPick={picker.onPick} onClose={() => setPicker(null)} />}
    </Layout>
  );
}

function TcgStatus({ row }) {
  if (!row.tcg_product_id) return <span className="muted small">Not linked</span>;
  return (
    <span className="small">
      <a href={`https://www.tcgplayer.com/product/${row.tcg_product_id}`} target="_blank" rel="noreferrer">#{row.tcg_product_id}</a>
      {row.tcg_subtype ? ` · ${row.tcg_subtype}` : ""}
      {row.price_source === "tcgplayer" ? <span className="tag-sync"> sync</span> : <span className="muted"> manual</span>}
    </span>
  );
}

function BuybackRules({ rules, onSave }) {
  const [rows, setRows] = useState(rules.map(r => ({ min: (r.min_value_cents / 100).toString(), percent: String(r.percent) })));
  useEffect(() => setRows(rules.map(r => ({ min: (r.min_value_cents / 100).toString(), percent: String(r.percent) }))), [rules]);
  const set = (i, k, v) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const sorted = [...rows].sort((a, b) => Number(a.min) - Number(b.min));

  return (
    <>
      <h2 className="sub-title">Buyback rates</h2>
      <p className="muted small">What players get when they sell a card back, by the card’s market value. You can also set a custom % on any single card in the pool table below.</p>
      <div className="rules-grid">
        {rows.map((r, i) => (
          <div key={i} className="rule-row">
            <span className="muted small">Cards worth</span>
            <span className="money-input">$<input className="input input-sm num" type="number" min="0" step="0.01" value={r.min} disabled={i === 0 && Number(r.min) === 0} onChange={e => set(i, "min", e.target.value)} /></span>
            <span className="muted small">and up →</span>
            <input className="input input-sm num" type="number" min="0" max="100" value={r.percent} onChange={e => set(i, "percent", e.target.value)} /><span>%</span>
            <button className="link-button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} disabled={i === 0 && Number(r.min) === 0}>Remove</button>
          </div>
        ))}
      </div>
      <div className="rules-actions">
        <button className="btn btn-small btn-ghost-dark" onClick={() => setRows(rs => [...rs, { min: "", percent: "" }])}>+ Add rate</button>
        <button className="btn btn-small" onClick={() => onSave(sorted)}>Save buyback rates</button>
      </div>
      <p className="muted small">Example: $5 card → {ruleFor(500, sorted.map(r => ({ min_value_cents: Math.round(Number(r.min) * 100), percent: Number(r.percent) })))}% · $150 card → {ruleFor(15000, sorted.map(r => ({ min_value_cents: Math.round(Number(r.min) * 100), percent: Number(r.percent) })))}% · $800 card → {ruleFor(80000, sorted.map(r => ({ min_value_cents: Math.round(Number(r.min) * 100), percent: Number(r.percent) })))}%</p>
    </>
  );
}

function TierRow({ t, active, onPick, onSave }) {
  const [name, setName] = useState(t.name);
  const [price, setPrice] = useState((t.price_cents / 100).toFixed(2));
  const [live, setLive] = useState(t.active);
  const dirty = name !== t.name || Math.round(price * 100) !== Number(t.price_cents) || live !== t.active;
  const warn = t.margin !== null && t.margin < 0.1;
  return (
    <tr className={active ? "row-active" : ""}>
      <td>{GAME_SHORT[t.game]}</td>
      <td><input className="input input-sm" value={name} onChange={e => setName(e.target.value)} /></td>
      <td><input className="input input-sm num" type="number" step="0.01" min="0.5" value={price} onChange={e => setPrice(e.target.value)} /></td>
      <td>{t.poolSize}</td>
      <td>{t.poolSize ? centsToMoney(t.evCents) : "—"}</td>
      <td className={warn ? "neg" : ""}>{t.margin === null ? "—" : pct(t.margin)}{warn ? " ⚠" : ""}</td>
      <td><input type="checkbox" checked={live} onChange={e => setLive(e.target.checked)} aria-label="Live" /></td>
      <td className="nowrap">
        <button className="btn btn-small btn-ghost-dark" onClick={onPick}>Pool</button>{" "}
        {dirty && <button className="btn btn-small" onClick={() => onSave({ name, price, active: live })}>Save</button>}
      </td>
    </tr>
  );
}

// Add cards to a pool. On a phone: tap 📷 Snap card (or pick several photos from
// the camera roll). Each photo is read with Claude to fill the form and becomes
// the card's pull image; after Add, the next photo in the queue loads.
function AddCard({ tier, tiers, onPool, pick, onAdd }) {
  const blank = { name: "", set_name: "", grade: "", value: "", weight: "1", buyback_percent: "", image: "", tcg: null, game: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }
  const [queue, setQueue] = useState([]);   // [{ key, photo, forAi, read: null | "reading" | { items } | { error } }]
  const [shown, setShown] = useState(null); // key of the queued photo the form shows
  const [aiOff, setAiOff] = useState(false);
  const [hint, setHint] = useState({ q: "", set: "" });
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  // Read queued photos one at a time, in the background.
  useEffect(() => {
    const next = queue.find(q => q.read === null);
    if (!next || queue.some(q => q.read === "reading")) return;
    if (aiOff) { setQueue(qs => qs.map(q => (q.read === null ? { ...q, read: { items: [] } } : q))); return; }
    setQueue(qs => qs.map(q => (q.key === next.key ? { ...q, read: "reading" } : q)));
    postJSON("/api/admin/read-photo", { image: next.forAi, mode: "add" })
      .then(r => ({ items: r.items || [] }))
      .catch(e => { if (e.status === 501) setAiOff(true); return { error: e.status === 501 ? "" : e.message, items: [] }; })
      .then(read => setQueue(qs => qs.map(q => (q.key === next.key ? { ...q, read, forAi: null } : q))));
  }, [queue, aiOff]);

  // Show the first queued photo in the form, and fill it in once it's been read.
  const head = queue[0];
  useEffect(() => {
    if (!head || shown === `${head.key}:filled`) return;
    const read = head.read && typeof head.read === "object" ? head.read : null;
    const fresh = shown !== head.key; // new photo: start from a blank form
    if (!read) { if (fresh) { setF({ ...blank, image: head.photo }); setShown(head.key); } return; }
    const it = read.items[0];
    // Anything typed while the photo was being read wins over what was read.
    setF(cur => {
      const base = fresh ? { ...blank, image: head.photo } : cur;
      if (!it) return base;
      return {
        ...base,
        name: base.name || (it.number && !it.name.includes(it.number) ? `${it.name} ${it.number}` : it.name),
        set_name: base.set_name || it.set,
        grade: base.grade || it.condition || "",
        value: base.value || (it.price ? it.price.toFixed(2) : ""),
        game: it.game && it.game !== "other" ? it.game : base.game,
      };
    });
    setHint(it ? { q: it.number || it.name, set: it.set } : { q: "", set: "" });
    setShown(`${head.key}:filled`);
  }, [head, shown]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onPhotos(e) {
    const files = [...(e.target.files || [])].slice(0, 40);
    e.target.value = "";
    if (!files.length) return;
    const added = [];
    for (const file of files) {
      try {
        const [photo, forAi] = await Promise.all([shrink(file, 900), shrink(file, 1400)]);
        added.push({ key: `${Date.now()}-${Math.random()}`, photo, forAi, read: null });
      } catch {}
    }
    setQueue(qs => [...qs, ...added]);
  }
  const nextPhoto = () => { setQueue(qs => qs.slice(1)); setShown(null); setF(blank); setHint({ q: "", set: "" }); };

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) setF({ ...f, image: await compress(file) });
  }
  function fromTcg(t) {
    setF(cur => ({
      ...cur,
      name: `${t.name}${t.number ? ` ${t.number}` : ""}`,
      set_name: t.setName,
      value: (t.cents / 100).toFixed(2),
      image: cur.image || t.imageUrl, // a photo you took wins over the stock image
      tcg: t,
      game: TCG_GAME[t.categoryId] || cur.game,
    }));
  }
  // Checks are done here (not by the browser), so a problem always shows as a
  // message under the Add button instead of a bubble that's easy to miss on a phone.
  const num = v => { const n = Number(String(v ?? "").replace(/[$,\s]/g, "")); return String(v ?? "").trim() === "" || !Number.isFinite(n) ? null : n; };
  async function submit(e) {
    e.preventDefault();
    const name = f.name.trim();
    const value = num(f.value), weight = f.weight === "" ? 1 : num(f.weight), bb = f.buyback_percent === "" ? "" : num(f.buyback_percent);
    const problems = [];
    if (!name) problems.push("enter the card name");
    if (value == null || value < 0) problems.push("enter the card’s value in dollars (e.g. 45 or 12.50)");
    if (weight == null || weight <= 0) problems.push("weight must be more than 0 (1 = normal)");
    if (bb !== "" && (bb == null || bb < 0 || bb > 100)) problems.push("buyback % must be 0–100, or leave it blank");
    if (problems.length) { setResult({ ok: false, text: `Not added yet: ${problems.join("; ")}.` }); return; }

    setBusy(true); setResult(null);
    try {
      const r = await onAdd({ ...f, name, value: (Math.round(value * 100) / 100).toFixed(2), weight: String(weight), buyback_percent: bb === "" ? "" : String(Math.round(bb)) });
      if (r?.ok) {
        setResult({ ok: true, text: `✓ Added ${name} to ${GAME_LABEL[tier.game]} · ${tier.name}.` });
        if (head) nextPhoto(); else setF(blank);
      } else {
        setResult({ ok: false, text: `Couldn’t add it: ${r?.error || "something went wrong"}. Nothing was saved — try again.` });
      }
    } catch (err) {
      setResult({ ok: false, text: `Couldn’t add it: ${err.message || "something went wrong"}. Nothing was saved — try again.` });
    } finally {
      setBusy(false);
    }
  }
  // Bring the result into view on a phone.
  const resultRef = useRef(null);
  useEffect(() => { if (result) resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [result]);

  // The card looks like a different game than this pool (from the photo or the TCGplayer match).
  const wrongGame = f.game && f.game !== tier.game;
  const suggest = wrongGame && (tiers.find(t => t.game === f.game && t.name === tier.name) || tiers.find(t => t.game === f.game && t.active) || tiers.find(t => t.game === f.game));
  const poolOptions = [...tiers].sort((a, b) => (GAME_LABEL[a.game] || "").localeCompare(GAME_LABEL[b.game] || "") || Number(b.active) - Number(a.active) || a.price_cents - b.price_cents);

  const reading = head && !(head.read && typeof head.read === "object");
  const readErr = head?.read?.error;
  const many = head?.read?.items?.length > 1;
  return (
    <form className="add-card-box" onSubmit={submit} noValidate>
      <label className="add-to">
        <span>Adding to</span>
        <select className="input" value={tier.id} onChange={e => { onPool(e.target.value); setResult(null); }} aria-label="Pool to add to">
          {poolOptions.map(t => <option key={t.id} value={t.id}>{GAME_LABEL[t.game]} · {t.name} ({centsToMoney(t.price_cents)}){t.active ? "" : " — hidden"}</option>)}
        </select>
      </label>
      <div className="snap-row">
        <label className="btn snap-btn">📷 Snap card<input type="file" accept="image/*" capture="environment" onChange={onPhotos} hidden /></label>
        <label className="btn btn-ghost-dark">🖼 Pick photos<input type="file" accept="image/*" multiple onChange={onPhotos} hidden /></label>
        <button type="button" className="btn btn-ghost-dark" onClick={() => pick(tier.game, fromTcg, { initialQuery: hint.q, initialSetFilter: hint.set })}>🔎 TCGplayer</button>
      </div>
      {head ? (
        <div className="snap-status">
          <img src={f.image || head.photo} alt="" />
          <div className="small">
            <b>Photo 1 of {queue.length}</b>
            <div className="muted">
              {reading ? "Reading the card…"
                : readErr ? `Couldn’t read it (${readErr}). Type the details in.`
                : aiOff ? "Photo reading isn’t set up (ANTHROPIC_API_KEY), so type the details in."
                : head.read.items.length ? `Read as ${head.read.items[0].name}. Check it, then tap TCGplayer for the value${f.grade && /psa|bgs|cgc|sgc|tag/i.test(f.grade) ? " (or enter the slab’s last sale)" : ""}.`
                : "No card found in this photo. Type the details in."}
            </div>
            {many && <div className="muted">There are {head.read.items.length} cards in this photo. Using the first one. One card per photo makes the best pull images.</div>}
            <button type="button" className="link-button" onClick={nextPhoto}>Skip this photo</button>
          </div>
        </div>
      ) : (
        <p className="muted small snap-hint">Take a photo of each card (front, straight on, filling the frame). It fills in the details and becomes the image players see when they pull it. Or search TCGplayer, or type it in.</p>
      )}
      {wrongGame && (
        <p className="pool-warn small">
          <span>⚠ This looks like a <b>{GAME_LABEL[f.game] || f.game}</b> card, but you’re adding it to <b>{GAME_LABEL[tier.game]} · {tier.name}</b>.</span>
          {suggest && <> <button type="button" className="btn btn-small" onClick={() => onPool(suggest.id)}>Switch to {GAME_LABEL[suggest.game]} · {suggest.name}</button></>}
        </p>
      )}
      {f.tcg && <p className="small">Linked to TCGplayer #{f.tcg.productId} · {f.tcg.subType} · {centsToMoney(f.tcg.cents)}{f.tcg.autoPrice ? " · price syncs daily" : ""} <button type="button" className="link-button" onClick={() => setF({ ...f, tcg: null })}>unlink</button></p>}
      <div className="add-card">
        <input className="input" placeholder="Card name" required {...bind("name")} />
        <input className="input" placeholder="Set" {...bind("set_name")} />
        <input className="input" placeholder="Grade (PSA 9, Raw NM…)" {...bind("grade")} />
        <input className="input num" type="text" inputMode="decimal" placeholder="Value $" aria-label="Value in dollars" {...bind("value")} />
        <input className="input num" type="text" inputMode="numeric" placeholder="Buyback % (auto)" title="Leave blank to use the buyback rates above" {...bind("buyback_percent")} />
        <input className="input num" type="text" inputMode="decimal" placeholder="Weight (1)" title="Relative chance. 1 = normal; 0.5 = half as likely." {...bind("weight")} />
        <label className="btn btn-small btn-ghost-dark file-btn">{f.image ? "Photo ✓" : "Photo"}<input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden /></label>
        <button className="btn btn-small" disabled={busy}>{busy ? "Adding…" : `Add to ${GAME_LABEL[tier.game]} · ${tier.name}`}</button>
      </div>
      {result && <p ref={resultRef} className={result.ok ? "add-ok small" : "error small add-err"} role="status">{result.text}</p>}
    </form>
  );
}

function CardRow({ c, tiers, rules, total, onSave, onLink, onUnlink, onComp }) {
  const [value, setValue] = useState((c.market_value_cents / 100).toFixed(2));
  const [weight, setWeight] = useState(String(c.weight));
  const [bb, setBb] = useState(c.buyback_percent == null ? "" : String(c.buyback_percent));
  useEffect(() => setValue((c.market_value_cents / 100).toFixed(2)), [c.market_value_cents]);
  // Keep in step with saved changes (e.g. after Balance to target margin).
  useEffect(() => setWeight(String(c.weight)), [c.weight]);
  useEffect(() => setBb(c.buyback_percent == null ? "" : String(c.buyback_percent)), [c.buyback_percent]);
  const [uploading, setUploading] = useState(false);
  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try { await onSave({ photo: await shrink(file, 900) }); } finally { setUploading(false); }
  }
  const dirty = Math.round(value * 100) !== Number(c.market_value_cents) || Number(weight) !== Number(c.weight) || bb !== (c.buyback_percent == null ? "" : String(c.buyback_percent));
  const inPool = c.status === "available";
  const auto = ruleFor(c.market_value_cents, rules);
  return (
    <tr className={inPool ? "" : "row-dim"}>
      <td>
        <div className="card-cell">
          <label className={`card-thumb${c.has_photo ? "" : " missing"}`} title={c.has_photo ? "Replace photo" : "Add photo"}>
            {uploading ? <span>…</span> : c.has_photo ? <img src={cardPhotoUrl(c)} alt="" loading="lazy" /> : <span>📷</span>}
            <input type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden />
          </label>
          <div>{c.name}<div className="muted small">{c.set_name}{c.owner ? ` · ${OWNER_NAMES[c.owner] || c.owner}` : ""}{c.cost_cents ? ` · cost ${centsToMoney(c.cost_cents)}` : ""}{c.has_photo ? "" : <span className="needs-photo"> · no photo</span>}</div></div>
        </div>
      </td>
      <td>{c.grade}</td>
      <td><input className="input input-sm num" type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} disabled={c.price_source !== "manual"} title={c.price_source === "tcgplayer" ? "Synced from TCGplayer — unlink to edit by hand" : c.price_source === "comp" ? "Set from the last sale — edit it under Last sold" : ""} /></td>
      <td><input className="input input-sm num" type="number" min="0" max="100" placeholder={`${auto} auto`} value={bb} onChange={e => setBb(e.target.value)} /></td>
      <td><input className="input input-sm num" type="number" step="any" min="0" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} /></td>
      <td>{inPool && total ? pct(Number(c.weight) / total) : "—"}</td>
      <td className="nowrap"><TcgStatus row={c} /><br /><button className="link-button" onClick={onLink}>{c.tcg_product_id ? "Relink" : "Link"}</button>{c.tcg_product_id && <> · <button className="link-button" onClick={onUnlink}>Unlink</button></>}</td>
      <td><CompCell row={c} onEdit={onComp} /></td>
      <td>{STATUS[c.status] || c.status}</td>
      <td className="nowrap">
        {dirty && <button className="btn btn-small" onClick={() => onSave({ ...(c.price_source !== "manual" ? {} : { value }), weight, buyback_percent: bb })}>Save</button>}{" "}
        {c.status === "available" && <button className="link-button" onClick={() => onSave({ status: "retired" })}>Remove</button>}
        {c.status === "retired" && <button className="link-button" onClick={() => onSave({ status: "available" })}>Restore</button>}
        {/* Move this card to another pool of the same game (live tiers first). Cards in a player's vault stay put. */}
        {(c.status === "available" || c.status === "retired") && <select className="input input-sm move-select" value="" aria-label="Move to pool" onChange={e => e.target.value && onSave({ tier_id: e.target.value })}>
          <option value="">Move to…</option>
          {tiers.filter(t => t.game === tiers.find(x => x.id === c.tier_id)?.game && t.id !== c.tier_id)
            .sort((a, b) => Number(b.active) - Number(a.active) || a.price_cents - b.price_cents)
            .map(t => <option key={t.id} value={t.id}>{t.name} · {centsToMoney(t.price_cents)}{t.active ? "" : " (hidden)"}</option>)}
        </select>}
      </td>
    </tr>
  );
}

// "12.5%" for everyday chances, "1 in 4,300" once they get small.
const chance = p => (!p ? "—" : p >= 0.01 ? pct(p) : `1 in ${Math.round(1 / p).toLocaleString("en-US")}`);
const fmtWeight = w => String(Number(w));

// Balance to target margin: cards worth ≤ the pack price go to weight 1, pricier
// cards are scaled down (the pricier, the more) until the average pull is about
// (1 − margin) × price. The preview runs the same code the server runs on save.
function BalancePool({ tier, cards, act }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(String(DEFAULT_TARGET_MARGIN * 100));
  const [busy, setBusy] = useState(false);
  const price = Number(tier.price_cents);
  const pool = useMemo(() => cards.filter(c => c.status === "available"), [cards]);
  const margin = Number(target) / 100;
  const validTarget = target.trim() !== "" && margin >= 0 && margin <= 0.9;

  const preview = useMemo(() => {
    if (!open || !validTarget) return null;
    const plan = balanceWeights(pool, price, margin);
    const after = pool.map(c => ({ ...c, weight: plan.weights[c.id] ?? c.weight }));
    const total = after.reduce((s, c) => s + Number(c.weight), 0);
    const oddsNow = oddsFor(pool, price), oddsAfter = oddsFor(after, price);
    // One line per identical card (same name, grade, value and weights).
    const groups = new Map();
    let changed = 0, lowCount = 0, lowReset = 0, lowValue = 0;
    for (const c of pool) {
      const w = plan.weights[c.id];
      if (Number(c.weight) !== w) changed++;
      if (c.market_value_cents <= price) {
        lowCount++; lowValue += c.market_value_cents;
        if (Number(c.weight) !== w) lowReset++;
        continue;
      }
      const key = [c.name, c.grade, c.market_value_cents, c.weight, w].join("|");
      const g = groups.get(key) || { name: c.name, grade: c.grade, value: c.market_value_cents, from: Number(c.weight), to: w, count: 0 };
      g.count++;
      groups.set(key, g);
    }
    const hits = [...groups.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
    return { plan, total, oddsNow, oddsAfter, hits, changed, lowCount, lowReset, lowAvg: lowCount ? lowValue / lowCount : 0 };
  }, [open, validTarget, pool, price, margin]);

  const evNow = expectedValue(pool);
  const marginNow = pool.length && price ? 1 - evNow / price : null;

  async function save() {
    setBusy(true);
    const ok = await act({ action: "balance-pool", tier: tier.id, margin },
      r => `${tier.name} balanced: ${r.changed} weight${r.changed === 1 ? "" : "s"} changed · avg pull ${centsToMoney(r.evCents)} · margin ${pct(r.margin)}.`);
    setBusy(false);
    if (ok) setOpen(false);
  }

  const p = preview?.plan;
  return (
    <>
      <div className="balance-bar">
        <button className="btn btn-small" onClick={() => setOpen(true)} disabled={!pool.length}>⚖ Balance to target margin</button>
        <span className="muted small">Now: avg pull {pool.length ? centsToMoney(Math.round(evNow)) : "—"} · margin {marginNow === null ? "—" : pct(marginNow)}</span>
      </div>
      {open && (
        <Modal wide title={`Balance ${GAME_SHORT[tier.game]} · ${tier.name}`} onClose={() => setOpen(false)}>
          <div className="bal">
            <label className="bal-target">
              <span>Target margin</span>
              <span className="money-input"><input className="input input-sm num" type="number" inputMode="decimal" min="0" max="90" step="0.5" value={target} onChange={e => setTarget(e.target.value)} />%</span>
              <span className="muted small">of {centsToMoney(price)} → avg pull ≈ {validTarget ? centsToMoney(Math.round((1 - margin) * price)) : "—"}</span>
            </label>
            {!validTarget && <p className="error small">Enter a margin between 0% and 90%.</p>}

            {preview && (
              <>
                <div className="bal-stats">
                  <div><span className="muted small">Now</span><b>{centsToMoney(Math.round(evNow))}</b><span className={marginNow < 0.1 ? "neg" : "pos"}>{pct(marginNow)} margin</span></div>
                  <div className="bal-arrow" aria-hidden="true">→</div>
                  <div><span className="muted small">After</span><b>{centsToMoney(Math.round(p.evCents))}</b><span className={p.margin < 0.1 ? "neg" : "pos"}>{pct(p.margin)} margin</span></div>
                </div>

                {p.status === "already-under" && <p className="banner light small">Even with every card at weight 1 the margin is {pct(p.margin)}, above your target. This only ever makes hits rarer, so the closest it gets is every card at weight 1.</p>}
                {p.status === "no-hits" && <p className="banner light small">No card is worth more than {centsToMoney(price)}, so there’s nothing to scale. Every card goes to weight 1.</p>}
                {p.status === "unreachable" && <p className="error small">Can’t reach {pct(margin)}: the {preview.lowCount} cards at or under {centsToMoney(price)} average {centsToMoney(Math.round(preview.lowAvg))} on their own ({pct(1 - preview.lowAvg / price)} margin), even with hits made nearly impossible. Add cheaper cards or lower the target.</p>}

                <h3 className="bal-h">Odds by value</h3>
                <table className="bal-odds">
                  <thead><tr><th>Card value</th><th>Now</th><th>After</th></tr></thead>
                  <tbody>
                    {preview.oddsAfter.map(b => (
                      <tr key={b.band}>
                        <td>{b.minCents === b.maxCents ? centsToMoney(b.minCents) : `${centsToMoney(b.minCents)}–${centsToMoney(b.maxCents)}`}<span className="muted small"> · {b.count}</span></td>
                        <td>{chance(preview.oddsNow.find(x => x.band === b.band)?.chance)}</td>
                        <td><b>{chance(b.chance)}</b></td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="bal-h">New weights</h3>
                {preview.hits.length > 0 && (
                  <ul className="bal-list">
                    {preview.hits.map((g, i) => (
                      <li key={i} className={g.from === g.to ? "same" : ""}>
                        <div className="bal-card"><span>{g.name}{g.grade ? <span className="muted"> · {g.grade}</span> : null}{g.count > 1 ? <span className="muted"> ×{g.count}</span> : null}</span><b>{centsToMoney(g.value)}</b></div>
                        <div className="muted small">weight {fmtWeight(g.from)} → <b className="ink">{fmtWeight(g.to)}</b> · {chance(g.to / preview.total)} per pull{g.count > 1 ? " each" : ""}</div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="muted small">{preview.lowCount} card{preview.lowCount === 1 ? "" : "s"} worth {centsToMoney(price)} or less {preview.lowCount === 1 ? "sits" : "sit"} at weight 1{preview.lowReset ? ` (${preview.lowReset} reset from another weight)` : ""}.</p>

                <div className="bal-actions">
                  <button className="btn" onClick={save} disabled={busy || p.status === "unreachable" || !preview.changed}>
                    {busy ? "Saving…" : preview.changed ? `Save ${preview.changed} weight${preview.changed === 1 ? "" : "s"}` : "No changes"}
                  </button>
                  <button className="link-button" onClick={() => setOpen(false)}>Cancel</button>
                </div>
                <p className="muted small">Weights are recalculated from the pool at the moment you save, so a card pulled in between is handled.</p>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

// Where every card that was ever stocked in this pool is now.
function PoolCounts({ cards }) {
  const n = st => cards.filter(c => c.status === st).length;
  const parts = [["In pool", n("available")], ["In vaults", n("held")], ["Waiting to ship", n("ship_requested")], ["Shipped", n("shipped")], ["Removed", n("retired")]];
  return (
    <p className="pool-counts small">
      {parts.filter(([, v], i) => v || i === 0).map(([label, v]) => <span key={label}><b>{v}</b> {label}</span>)}
      <span className="muted">· {cards.length} total</span>
    </p>
  );
}

function Shipment({ s, onShip }) {
  const [tracking, setTracking] = useState("");
  const a = s.address || {};
  return (
    <div className="ship-box">
      <div>
        <b>#{s.id}</b> · {new Date(s.created_at).toLocaleString()}
        <ul>{s.cards.map((n, i) => <li key={i}>{n}</li>)}</ul>
      </div>
      <address>
        {a.order && <><b>{a.pickup ? "Pickup with website order" : "Pack with website order"}</b><br /></>}
        {a.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}{a.pickup ? null : <><br />{a.city}, {a.state} {a.zip}</>}
      </address>
      <div className="ship-do">
        <input className="input input-sm" placeholder="Tracking #" value={tracking} onChange={e => setTracking(e.target.value)} />
        <button className="btn btn-small" onClick={() => onShip(tracking)}>Mark shipped</button>
      </div>
    </div>
  );
}

function CompCell({ row, onEdit }) {
  return (
    <span className="small">
      {row.comp_cents != null ? (
        <>
          {row.comp_url ? <a href={row.comp_url} target="_blank" rel="noreferrer">{centsToMoney(row.comp_cents)}</a> : centsToMoney(row.comp_cents)}
          <span className="muted"> · {row.comp_source || "sale"}{row.comp_date ? ` · ${String(row.comp_date).slice(5, 10)}` : ""}</span>
          {row.price_source === "comp" && <span className="tag-sync"> value</span>}
          <br />
        </>
      ) : null}
      <button className="link-button" onClick={onEdit}>{row.comp_cents != null ? "Edit" : "Add"}</button>
    </span>
  );
}

// Record a card's most recent sale from eBay, Goldin, Card Ladder, etc.
function CompEditor({ row, onSave, onClose }) {
  const [price, setPrice] = useState(row.comp_cents != null ? (row.comp_cents / 100).toFixed(2) : "");
  const [source, setSource] = useState(row.comp_source || "eBay");
  const [date, setDate] = useState(row.comp_date ? String(row.comp_date).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [url, setUrl] = useState(row.comp_url || "");
  const [use, setUse] = useState(row.price_source === "comp" || (row.price_source === "manual" && row.comp_cents == null));
  const synced = row.price_source === "tcgplayer";

  return (
    <Modal title={`Last sold · ${row.name}`} onClose={onClose}>
      <form className="stack" onSubmit={e => { e.preventDefault(); onSave({ price, source, date, url, use: use && !synced }); }}>
        <div className="comp-row">
          <label className="field">Sold for ($)<input className="input" type="number" min="0" step="0.01" required value={price} onChange={e => setPrice(e.target.value)} /></label>
          <label className="field">Where<select className="input" value={source} onChange={e => setSource(e.target.value)}>{COMP_SOURCES.map(s => <option key={s}>{s}</option>)}</select></label>
          <label className="field">Date<input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        </div>
        <label className="field">Link to the sale (optional)<input className="input" type="url" placeholder="https://www.ebay.com/itm/…" value={url} onChange={e => setUrl(e.target.value)} /></label>
        <p className="small research">Look it up: <a href={ebaySold(row.name, row.grade)} target="_blank" rel="noreferrer">eBay sold listings</a> · <a href="https://app.cardladder.com/" target="_blank" rel="noreferrer">Card Ladder</a> · <a href={`https://goldin.co/search?q=${encodeURIComponent(row.name)}`} target="_blank" rel="noreferrer">Goldin</a></p>
        {synced
          ? <p className="muted small">This card’s price syncs from TCGplayer. The last sale is kept as the backup and used automatically whenever TCGplayer has no price.</p>
          : <label className="check"><input type="checkbox" checked={use} onChange={e => setUse(e.target.checked)} /><span>Use this sale as the card’s value (best for graded slabs)</span></label>}
        <button className="btn btn-block">Save last sale</button>
      </form>
    </Modal>
  );
}

// eBay search limited to sold listings.
const ebaySold = (name, grade) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent([name, grade && !/^raw/i.test(grade) ? grade : ""].filter(Boolean).join(" "))}&LH_Sold=1&LH_Complete=1`;

const SUB_STATUS = { submitted: "New", offered: "Offer sent", accepted: "Accepted — awaiting card", paid: "Paid", declined: "Player declined", rejected: "Rejected" };

// Player-submitted cards: review → offer → (player accepts) → card arrives → pay + add to a pool.
function Submissions({ subs, tiers, rules, act }) {
  const open = subs.filter(s => ["submitted", "offered", "accepted"].includes(s.status));
  const closed = subs.filter(s => !["submitted", "offered", "accepted"].includes(s.status));
  return (
    <>
      <h2 className="sub-title">Card submissions ({open.filter(s => s.status !== "offered").length} need you)</h2>
      {!open.length && <p className="muted">No cards waiting. Players submit from the Sell tab.</p>}
      {open.map(s => <SubmissionCard key={s.id} s={s} tiers={tiers.filter(t => t.game === s.game)} rules={rules} act={act} />)}
      {closed.length > 0 && (
        <details className="closed-subs">
          <summary>Recently closed ({closed.length})</summary>
          <ul>{closed.map(s => <li key={s.id}><b>{s.id}</b> · {s.name} · {SUB_STATUS[s.status]}{s.status === "paid" ? ` · paid ${centsToMoney(s.offer_cents)}` : ""} · {s.email}</li>)}</ul>
        </details>
      )}
    </>
  );
}

function SubmissionCard({ s, tiers, rules, act }) {
  const startValue = s.value_cents ?? s.market_cents ?? s.asking_cents ?? 0;
  const [value, setValue] = useState((startValue / 100).toFixed(2));
  const [offer, setOffer] = useState(((s.offer_cents ?? Math.floor(startValue * ruleFor(startValue, rules) / 100)) / 100).toFixed(2));
  const [note, setNote] = useState(s.admin_note || "");
  const v = Math.round(Number(value) * 100);
  // Suggest the priciest tier the card is still worth at least ~3x… or the cheapest tier.
  const suggested = [...tiers].sort((a, b) => b.price_cents - a.price_cents).find(t => v >= t.price_cents * 3) || [...tiers].sort((a, b) => a.price_cents - b.price_cents)[0];
  const [tier, setTier] = useState(suggested?.id || "");
  const img = side => `/api/submission-photo/${encodeURIComponent(s.id)}?side=${side}`;

  return (
    <div className="sub-card">
      <div className="sub-photos">
        <a href={img("front")} target="_blank" rel="noreferrer"><img src={img("front")} alt="Front" /></a>
        <a href={img("back")} target="_blank" rel="noreferrer"><img src={img("back")} alt="Back" onError={e => { e.currentTarget.parentElement.style.display = "none"; }} /></a>
      </div>
      <div className="sub-details">
        <div><b>{s.name}</b> <span className="muted">{[s.set_name, s.card_number].filter(Boolean).join(" · ")}</span></div>
        <div className="small">{GAME_LABEL[s.game]} · <b>{s.grade || "No grade given"}</b> · <span className="code-light">{s.id}</span> · {s.email}</div>
        <div className="small">
          {s.market_cents != null ? <>TCGplayer market <b>{centsToMoney(s.market_cents)}</b> · </> : null}
          {s.asking_cents != null ? <>Asking <b>{centsToMoney(s.asking_cents)}</b> · </> : null}
          <a href={ebaySold(s.name, s.grade)} target="_blank" rel="noreferrer">eBay sold</a> · <a href="https://app.cardladder.com/" target="_blank" rel="noreferrer">Card Ladder</a>
          {s.tcg_product_id ? <> · <a href={`https://www.tcgplayer.com/product/${s.tcg_product_id}`} target="_blank" rel="noreferrer">TCGplayer</a></> : null}
        </div>
        {s.note && <div className="small muted">Player: “{s.note}”</div>}
        <div className="small"><span className="pill-status">{SUB_STATUS[s.status]}</span> · sent {new Date(s.created_at).toLocaleDateString()}</div>
      </div>
      <div className="sub-do">
        {s.status === "accepted" ? (
          <>
            <label className="small">Pool<select className="input input-sm" value={tier} onChange={e => setTier(e.target.value)}>{tiers.map(t => <option key={t.id} value={t.id}>{t.name} ({centsToMoney(t.price_cents)})</option>)}</select></label>
            <label className="small">Pool value $<input className="input input-sm num" type="number" step="0.01" min="0" value={value} onChange={e => setValue(e.target.value)} /></label>
            <button className="btn btn-small" onClick={() => act({ action: "pay-submission", id: s.id, tier, value }, `Paid ${centsToMoney(s.offer_cents)} and added ${s.name} to the pool.`)}>Card arrived — pay {centsToMoney(s.offer_cents)}</button>
            <button className="link-button" onClick={() => act({ action: "reject-submission", id: s.id, note: note || "Card didn’t match the photos." }, "Submission rejected.")}>Card not as described</button>
          </>
        ) : (
          <>
            <label className="small">Our value $<input className="input input-sm num" type="number" step="0.01" min="0" value={value} onChange={e => { setValue(e.target.value); setOffer((Math.floor(Math.round(Number(e.target.value) * 100) * ruleFor(Math.round(Number(e.target.value) * 100), rules) / 100) / 100).toFixed(2)); }} /></label>
            <label className="small">Offer $<input className="input input-sm num" type="number" step="0.01" min="0" value={offer} onChange={e => setOffer(e.target.value)} /></label>
            <input className="input input-sm" placeholder="Note to player (optional)" value={note} onChange={e => setNote(e.target.value)} />
            <button className="btn btn-small" onClick={() => act({ action: "offer-submission", id: s.id, value, offer, note }, `Offer sent for ${s.name}.`)}>{s.status === "offered" ? "Update offer" : "Send offer"}</button>
            <button className="link-button" onClick={() => act({ action: "reject-submission", id: s.id, note }, "Submission rejected.")}>Reject</button>
          </>
        )}
      </div>
    </div>
  );
}

// Hand out pack credit: testing before Stripe is live, refunds, giveaways, raffle prizes.
function GiveCredit({ act }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("50");
  const [note, setNote] = useState("Test credit");
  return (
    <>
      <h2 className="sub-title">Give pack credit</h2>
      <form className="credit-form" onSubmit={async e => { e.preventDefault(); if (await act({ action: "adjust-balance", email, amount, note }, r => `Done — ${email} now has ${centsToMoney(r.balance_cents)}.`)) setEmail(""); }}>
        <input className="input input-sm" type="email" required placeholder="player@email.com" value={email} onChange={e => setEmail(e.target.value)} />
        <span className="money-input">$<input className="input input-sm num" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></span>
        <input className="input input-sm" placeholder="Reason (shows in their activity)" value={note} onChange={e => setNote(e.target.value)} />
        <button className="btn btn-small">Add credit</button>
      </form>
      <p className="muted small">They need to have signed in once. Use a negative amount to take credit back.</p>
    </>
  );
}

// → Pack: move copies of a store single into a pool (photo, name, value carried over).
function MoveToPool({ item, tiers, current, act }) {
  const [open, setOpen] = useState(false);
  const own = tiers.filter(t => t.game === (item.game || "other"));
  const list = own.length ? own : tiers;
  const [tier, setTier] = useState(list.some(t => t.id === current) ? current : list[0]?.id || "");
  const [qty, setQty] = useState(1);
  const [value, setValue] = useState(Number(item.price).toFixed(2));
  if (!open) return <button className="btn btn-small" disabled={item.quantity <= 0} onClick={() => setOpen(true)}>→ Pack</button>;
  return (
    <span className="move-pool">
      <select className="input input-sm" value={tier} onChange={e => setTier(e.target.value)} aria-label="Pool">{list.map(t => <option key={t.id} value={t.id}>{GAME_LABEL[t.game]} · {t.name}</option>)}</select>
      <input className="input input-sm num" type="number" min="1" max={item.quantity} value={qty} onChange={e => setQty(e.target.value)} aria-label="How many" title="How many copies" />
      <span className="money-input">$<input className="input input-sm num" type="number" step="0.01" min="0" value={value} onChange={e => setValue(e.target.value)} aria-label="Pool value" title="Value in the pool" /></span>
      <button className="btn btn-small" onClick={async () => { if (await act({ action: "move-to-pool", id: item.id, tier, qty, value }, `Moved ${qty} × ${item.name} into the pool.`)) setOpen(false); }}>Move</button>
      <button className="link-button" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

// Minimal CSV parser (quoted fields, commas and newlines inside quotes).
function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const OWNER_NAMES = { sam: "Sam", bear_umer: "Bear / Umer", shared: "Shared 50/50" };
const COLS = { owner: ["owner"], cost: ["cost"], name: ["name", "card", "card name", "title"], set: ["set", "set name", "expansion"], grade: ["grade", "condition"], value: ["value", "price", "market", "market value"], qty: ["qty", "quantity", "count"], image: ["image", "photo", "image url", "img"], weight: ["weight"] };

// Import CSV: spreadsheet → pool. Columns (any order): name, set, grade, value, qty, image, weight.
// Same card = same name, set and grade (values drift with price syncs).
const cardKey = (name, set, grade) => [name, set, grade].map(v => String(v || "").trim().toLowerCase().replace(/\s+/g, " ")).join("|");

function ImportPool({ tier, act, allCards }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const [skipDupes, setSkipDupes] = useState(true);
  // Re-importing the same file (e.g. an IllestCollect export) must not double the
  // pool. Match each row against cards already in any pool, in a vault or shipped,
  // copy for copy, and leave those copies out unless told otherwise.
  const plan = useMemo(() => {
    if (!rows) return null;
    const have = new Map();
    for (const c of allCards) { const k = cardKey(c.name, c.set_name, c.grade); have.set(k, (have.get(k) || 0) + 1); }
    let dupes = 0;
    const fresh = [];
    for (const r of rows) {
      const k = cardKey(r.name, r.set, r.grade);
      const qty = Math.max(1, Math.round(Number(r.qty) || 1));
      const already = Math.min(qty, have.get(k) || 0);
      have.set(k, (have.get(k) || 0) - already);
      dupes += already;
      if (qty - already > 0) fresh.push({ ...r, qty: qty - already });
    }
    return { dupes, fresh };
  }, [rows, allCards]);
  async function onFile(e) {
    const file = e.target.files?.[0]; e.target.value = ""; setErr(""); setRows(null);
    if (!file) return;
    const text = await file.text();
    // IllestCollect pool export (JSON): only cards still in stock and not deleted.
    if (/\.json$/i.test(file.name) || text.trim().startsWith("[")) {
      let list;
      try { list = JSON.parse(text); } catch { return setErr("That JSON file couldn’t be read."); }
      if (!Array.isArray(list)) return setErr("Expected a list of cards.");
      const live = list.filter(c => c && c.name && c.in_stock !== false && !c.deleted_at);
      return setRows(live.map(c => ({
        name: c.name, set: c.set || "", value: c.value ?? c.price ?? "", qty: 1, weight: 1,
        grade: c.graded ? [c.gradingCo, c.grade].filter(Boolean).join(" ") : (c.grade || c.condition || "Raw"),
        image: c.imgUrl || c.image || "", owner: c.owner || "", cost: c.cost ?? "",
      })));
    }
    const table = parseCSV(text);
    if (table.length < 2) return setErr("That file has no rows.");
    const head = table[0].map(h => h.trim().toLowerCase());
    const idx = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, head.findIndex(h => names.includes(h))]));
    if (idx.name < 0 || idx.value < 0) return setErr("Needs at least a “name” column and a “value” (or “price”) column.");
    setRows(table.slice(1).map(r => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? (r[i] || "").trim().replace(/^\$/, "") : ""]))).filter(r => r.name));
  }
  const template = "data:text/csv;charset=utf-8," + encodeURIComponent("name,set,grade,value,qty,image,weight\nSon Goku SCR FB01-139,Awakened Pulse,PSA 10,120,1,,0.5\nVegeta SR FB02-061,Blazing Aura,Raw NM,6.50,3,,1\n");
  return (
    <div className="import-pool">
      <label className="btn btn-small btn-ghost-dark">⬆ Import CSV / IllestCollect JSON into {tier.name}<input type="file" accept=".csv,text/csv,.json,application/json" onChange={onFile} hidden /></label>
      <a className="small" href={template} download="pool-template.csv">Download template</a>
      {rows && plan && (() => {
        const send = skipDupes ? plan.fresh : rows;
        const copies = send.reduce((s, r) => s + (Number(r.qty) || 1), 0);
        return (
          <span className="small import-ready">
            {plan.dupes > 0 && (
              <span className="import-dupes">
                ⚠ {plan.dupes} cop{plan.dupes === 1 ? "y is" : "ies are"} already in your pools or vaults (same name, set and grade).{" "}
                <label className="check-inline"><input type="checkbox" checked={skipDupes} onChange={e => setSkipDupes(e.target.checked)} /> Skip {plan.dupes === 1 ? "it" : "them"}</label>
              </span>
            )}
            <span>
              {copies} cop{copies === 1 ? "y" : "ies"} ({money(send.reduce((s, r) => s + Number(r.value || 0) * (Number(r.qty) || 1), 0))} total value) ready ·{" "}
              <button className="btn btn-small" disabled={!copies} onClick={async () => { if (await act({ action: "import-pool", tier: tier.id, rows: send }, r => `Imported ${r.added} cards into ${tier.name}${skipDupes && plan.dupes ? ` (skipped ${plan.dupes} already in your pools)` : ""}.`)) setRows(null); }}>Import</button>{" "}
              <button className="link-button" onClick={() => setRows(null)}>Cancel</button>
            </span>
          </span>
        );
      })()}
      {err && <span className="error small">{err}</span>}
    </div>
  );
}

// Find a card in any pool (handy when a card seems to have "disappeared" into another game's pool).
function PoolSearch({ cards, tiers, onOpen }) {
  const [q, setQ] = useState("");
  const byId = Object.fromEntries(tiers.map(t => [t.id, t]));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hits = words.length ? cards.filter(c => words.every(w => `${c.name} ${c.set_name} ${c.grade}`.toLowerCase().includes(w))).slice(0, 15) : [];
  return (
    <div className="pool-search">
      <input className="input" type="search" placeholder="Find a card in any pool…" value={q} onChange={e => setQ(e.target.value)} aria-label="Find a card in any pool" />
      {words.length > 0 && (
        <ul className="pool-hits">
          {!hits.length && <li className="muted small">No card matches.</li>}
          {hits.map(c => {
            const t = byId[c.tier_id];
            return (
              <li key={c.id}>
                <span><b>{c.name}</b> <span className="muted small">{[c.grade, centsToMoney(c.market_value_cents), STATUS[c.status] || c.status].filter(Boolean).join(" · ")}</span></span>
                <button className="btn btn-small btn-ghost-dark" onClick={() => { onOpen(c.tier_id); setQ(""); }}>{t ? `${GAME_SHORT[t.game]} · ${t.name}` : "Open"}</button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Search + filters for the store-singles table (it can hold thousands of cards).
function SinglesFilter({ items, game, render }) {
  const [q, setQ] = useState("");
  const [g, setG] = useState(game || "");
  const [stock, setStock] = useState("in");
  const [limit, setLimit] = useState(50);
  useEffect(() => { setG(game || ""); setLimit(50); }, [game]);
  const norm = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const terms = norm(q).split(/\s+/).filter(Boolean);
  const list = items.filter(i =>
    (!g || (i.game || "other") === g) &&
    (stock === "all" || i.quantity > 0) &&
    terms.every(t => norm(`${i.name} ${i.set_name}`).includes(t)));
  return (
    <>
      <div className="singles-filter">
        <input className="input input-sm" type="search" placeholder="Search name or set…" value={q} onChange={e => { setQ(e.target.value); setLimit(50); }} aria-label="Search singles" />
        <select className="input input-sm" value={g} onChange={e => { setG(e.target.value); setLimit(50); }} aria-label="Game">
          <option value="">All games</option>{GAMES.map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
        <select className="input input-sm" value={stock} onChange={e => setStock(e.target.value)} aria-label="Stock">
          <option value="in">In stock</option><option value="all">Include sold out</option>
        </select>
        <span className="muted small">{list.length.toLocaleString()} of {items.length.toLocaleString()}</span>
      </div>
      {render(list.slice(0, limit))}
      {list.length > limit && <button className="btn btn-small btn-ghost-dark" onClick={() => setLimit(l => l + 100)}>Show more ({(list.length - limit).toLocaleString()} left)</button>}
    </>
  );
}
