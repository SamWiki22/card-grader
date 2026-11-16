import { useCallback, useEffect, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import TcgPicker from "../../components/TcgPicker";
import { useMe, postJSON } from "../../lib/me";
import { GAME_LABEL, centsToMoney } from "../../lib/shared";

const pct = n => `${(n * 100).toFixed(1)}%`;
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

export default function AdminPacks() {
  const me = useMe();
  const [data, setData] = useState(null);
  const [denied, setDenied] = useState("");
  const [tierId, setTierId] = useState("");
  const [msg, setMsg] = useState("");
  const [picker, setPicker] = useState(null); // { game, onPick }

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/packs");
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setData(d);
    setTierId(t => t || d.tiers.find(x => x.game === "pokemon")?.id || d.tiers[0]?.id || "");
  }, []);
  useEffect(() => { if (me.user) load(); }, [me.user, load]);

  async function act(body, okMsg) {
    setMsg("");
    try {
      const r = await postJSON("/api/admin/packs", body);
      await load();
      if (okMsg) setMsg(typeof okMsg === "function" ? okMsg(r) : okMsg);
      return true;
    } catch (e) { setMsg(`Error: ${e.message}`); return false; }
  }
  const pick = (game, onPick) => setPicker({ game, onPick: t => { setPicker(null); onPick(t); } });

  if (!me.loading && !me.user) {
    return <Layout title="Admin"><section className="wrap section"><p>Sign in with an admin email.</p></section><SignIn onClose={() => {}} /></Layout>;
  }
  if (denied) return <Layout title="Admin"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!data) return <Layout title="Admin"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  const tier = data.tiers.find(t => t.id === tierId);
  const cards = data.cards.filter(c => c.tier_id === tierId);
  const openShipments = data.shipments.filter(s => s.status === "requested");
  const synced = data.cards.filter(c => c.price_source === "tcgplayer").length + data.items.filter(i => i.price_source === "tcgplayer").length;

  return (
    <Layout title="Packs admin">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Packs admin</h1>
          <button className="btn btn-small btn-ghost-dark" onClick={() => act({ action: "refresh-prices" }, r => `TCGplayer prices refreshed: ${r.updated} updated, ${r.unchanged} unchanged${r.missing ? `, ${r.missing} with no price` : ""}.`)}>
            Refresh TCGplayer prices ({synced} synced)
          </button>
        </div>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}

        <h2 className="sub-title">Tiers</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Game</th><th>Tier</th><th>Price</th><th>Pool</th><th>Avg pull value</th><th>House margin</th><th>Live</th><th /></tr></thead>
            <tbody>
              {data.tiers.map(t => <TierRow key={t.id} t={t} active={t.id === tierId} onPick={() => setTierId(t.id)} onSave={b => act({ action: "update-tier", id: t.id, ...b }, "Tier saved.")} />)}
            </tbody>
          </table>
        </div>
        <p className="muted small">House margin = 1 − (average card value pulled ÷ pack price). Below ~10% you’re likely losing money after shipping and fees.</p>

        <BuybackRules rules={data.rules} onSave={rules => act({ action: "save-buyback-rules", rules }, "Buyback rates saved.")} />

        {tier && (
          <>
            <h2 className="sub-title">{GAME_LABEL[tier.game]} · {tier.name} pool</h2>
            <AddCard tier={tier} games={data.tcgGames} pick={pick} onAdd={b => act({ action: "add-card", tier_id: tier.id, ...b }, "Card added to pool.")} />
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Card</th><th>Grade</th><th>Value</th><th>Buyback</th><th>Weight</th><th>Chance</th><th>TCGplayer</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {cards.map(c => <CardRow key={c.id} c={c} rules={data.rules} total={cards.filter(x => x.status === "available").reduce((s, x) => s + Number(x.weight), 0)}
                    onSave={b => act({ action: "update-card", id: c.id, ...b }, "Card updated.")}
                    onLink={() => pick(tier.game, t => act({ action: "link-tcg", target: "pack", id: c.id, tcg: t }, `Linked to TCGplayer${t.autoPrice ? " — price now follows market" : ""}.`))}
                    onUnlink={() => act({ action: "unlink-tcg", target: "pack", id: c.id }, "TCGplayer link removed; price is manual.")} />)}
                  {!cards.length && <tr><td colSpan={9} className="muted">No cards in this pool yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        <h2 className="sub-title">Store singles · TCGplayer pricing</h2>
        <p className="muted small">Singles from BB Inventory. Link one to TCGplayer and tick “sync” to have its store price follow the TCGplayer market price every day.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Card</th><th>Cond.</th><th>Qty</th><th>Store price</th><th>TCGplayer</th><th /></tr></thead>
            <tbody>
              {data.items.map(i => (
                <tr key={i.id}>
                  <td>{i.name}<div className="muted small">{i.set_name}</div></td>
                  <td>{i.condition}</td>
                  <td>{i.quantity}</td>
                  <td>{centsToMoney(Math.round(Number(i.price) * 100))}</td>
                  <td><TcgStatus row={i} /></td>
                  <td className="nowrap">
                    <button className="btn btn-small btn-ghost-dark" onClick={() => pick(i.game || "pokemon", t => act({ action: "link-tcg", target: "item", id: i.id, tcg: t }, `${i.name} linked${t.autoPrice ? " — store price now follows TCGplayer" : ""}.`))}>{i.tcg_product_id ? "Relink" : "Link"}</button>{" "}
                    {i.tcg_product_id && <button className="link-button" onClick={() => act({ action: "unlink-tcg", target: "item", id: i.id }, "Link removed.")}>Unlink</button>}
                  </td>
                </tr>
              ))}
              {!data.items.length && <tr><td colSpan={6} className="muted">No singles in inventory yet.</td></tr>}
            </tbody>
          </table>
        </div>

        <h2 className="sub-title">Shipping requests ({openShipments.length})</h2>
        {!openShipments.length ? <p className="muted">Nothing to ship.</p> : openShipments.map(s => (
          <Shipment key={s.id} s={s} onShip={tracking => act({ action: "mark-shipped", id: s.id, tracking }, `Shipment #${s.id} marked shipped.`)} />
        ))}
      </section>
      {picker && <TcgPicker games={data.tcgGames} initialGame={picker.game} onPick={picker.onPick} onClose={() => setPicker(null)} />}
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
      <td>{GAME_LABEL[t.game]}</td>
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

function AddCard({ tier, games, pick, onAdd }) {
  const blank = { name: "", set_name: "", grade: "", value: "", weight: "1", buyback_percent: "", image: "", tcg: null };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const bind = k => ({ value: f[k], onChange: e => setF({ ...f, [k]: e.target.value }) });

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    if (file) setF({ ...f, image: await compress(file) });
  }
  function fromTcg(t) {
    setF(cur => ({
      ...cur,
      name: `${t.name}${t.number ? ` ${t.number}` : ""}`,
      set_name: t.setName,
      value: (t.cents / 100).toFixed(2),
      image: cur.image || t.imageUrl,
      tcg: t,
    }));
  }
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    if (await onAdd(f)) setF(blank);
    setBusy(false);
  }

  return (
    <form className="add-card-box" onSubmit={submit}>
      <div className="add-card-top">
        <button type="button" className="btn btn-small" onClick={() => pick(tier.game, fromTcg)}>Find on TCGplayer</button>
        {f.tcg
          ? <span className="small">Linked to TCGplayer #{f.tcg.productId} · {f.tcg.subType} · {centsToMoney(f.tcg.cents)}{f.tcg.autoPrice ? " · price syncs daily" : ""} <button type="button" className="link-button" onClick={() => setF({ ...f, tcg: null })}>unlink</button></span>
          : <span className="muted small">…or fill it in by hand (best for graded slabs TCGplayer doesn’t price).</span>}
      </div>
      <div className="add-card">
        <input className="input" placeholder="Card name" required {...bind("name")} />
        <input className="input" placeholder="Set" {...bind("set_name")} />
        <input className="input" placeholder="Grade (PSA 9, Raw NM…)" {...bind("grade")} />
        <input className="input num" type="number" step="0.01" min="0" placeholder="Value $" required {...bind("value")} />
        <input className="input num" type="number" min="0" max="100" placeholder="Buyback % (auto)" title="Leave blank to use the buyback rates above" {...bind("buyback_percent")} />
        <input className="input num" type="number" step="0.1" min="0.1" placeholder="Weight" title="Relative chance. 1 = normal; 0.5 = half as likely." {...bind("weight")} />
        <label className="btn btn-small btn-ghost-dark file-btn">{f.image ? "Photo ✓" : "Photo"}<input type="file" accept="image/*" onChange={onPhoto} hidden /></label>
        <button className="btn btn-small" disabled={busy}>{busy ? "Adding…" : `Add to ${tier.name}`}</button>
      </div>
    </form>
  );
}

function CardRow({ c, rules, total, onSave, onLink, onUnlink }) {
  const [value, setValue] = useState((c.market_value_cents / 100).toFixed(2));
  const [weight, setWeight] = useState(String(c.weight));
  const [bb, setBb] = useState(c.buyback_percent == null ? "" : String(c.buyback_percent));
  useEffect(() => setValue((c.market_value_cents / 100).toFixed(2)), [c.market_value_cents]);
  const dirty = Math.round(value * 100) !== Number(c.market_value_cents) || Number(weight) !== Number(c.weight) || bb !== (c.buyback_percent == null ? "" : String(c.buyback_percent));
  const inPool = c.status === "available";
  const auto = ruleFor(c.market_value_cents, rules);
  return (
    <tr className={inPool ? "" : "row-dim"}>
      <td>{c.name}<div className="muted small">{c.set_name}</div></td>
      <td>{c.grade}</td>
      <td><input className="input input-sm num" type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} disabled={c.price_source === "tcgplayer"} title={c.price_source === "tcgplayer" ? "Synced from TCGplayer — unlink to edit by hand" : ""} /></td>
      <td><input className="input input-sm num" type="number" min="0" max="100" placeholder={`${auto} auto`} value={bb} onChange={e => setBb(e.target.value)} /></td>
      <td><input className="input input-sm num" type="number" step="0.1" min="0.1" value={weight} onChange={e => setWeight(e.target.value)} /></td>
      <td>{inPool && total ? pct(Number(c.weight) / total) : "—"}</td>
      <td className="nowrap"><TcgStatus row={c} /><br /><button className="link-button" onClick={onLink}>{c.tcg_product_id ? "Relink" : "Link"}</button>{c.tcg_product_id && <> · <button className="link-button" onClick={onUnlink}>Unlink</button></>}</td>
      <td>{STATUS[c.status] || c.status}</td>
      <td className="nowrap">
        {dirty && <button className="btn btn-small" onClick={() => onSave({ ...(c.price_source === "tcgplayer" ? {} : { value }), weight, buyback_percent: bb })}>Save</button>}{" "}
        {c.status === "available" && <button className="link-button" onClick={() => onSave({ status: "retired" })}>Remove</button>}
        {c.status === "retired" && <button className="link-button" onClick={() => onSave({ status: "available" })}>Restore</button>}
      </td>
    </tr>
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
      <address>{a.name}<br />{a.line1}{a.line2 ? <>, {a.line2}</> : null}<br />{a.city}, {a.state} {a.zip}</address>
      <div className="ship-do">
        <input className="input input-sm" placeholder="Tracking #" value={tracking} onChange={e => setTracking(e.target.value)} />
        <button className="btn btn-small" onClick={() => onShip(tracking)}>Mark shipped</button>
      </div>
    </div>
  );
}
