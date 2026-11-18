import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "../../components/Layout";
import SignIn from "../../components/SignIn";
import { AdminGate } from "../../components/TeamLogin";
import { useMe, postJSON } from "../../lib/me";
import { money } from "../../lib/shared";

const OWNERS = { sam: "Sam", bear_umer: "Bear / Umer", shared: "Shared 50/50", "": "No owner" };
const RANGES = [{ days: 7, label: "7 days" }, { days: 30, label: "30 days" }, { days: 90, label: "90 days" }, { days: 365, label: "Year" }];
const dayKey = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayLabel = key => new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const profitOf = s => Number(s.total) - Number(s.item_cost || 0) * Number(s.quantity);

function sum(list) {
  return {
    count: list.length,
    units: list.reduce((a, s) => a + Number(s.quantity), 0),
    revenue: list.reduce((a, s) => a + Number(s.total), 0),
    profit: list.reduce((a, s) => a + profitOf(s), 0),
  };
}

// Daily sales for admins: every in-person, photo-recorded and website sale.
export default function Sales() {
  const me = useMe();
  const [days, setDays] = useState(30);
  const [sales, setSales] = useState(null);
  const [denied, setDenied] = useState("");
  const [open, setOpen] = useState(() => dayKey(new Date().toISOString()));
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const from = new Date(); from.setHours(0, 0, 0, 0); from.setDate(from.getDate() - (days - 1));
    const r = await fetch(`/api/admin/sales?from=${encodeURIComponent(from.toISOString())}`);
    const d = await r.json();
    if (!r.ok) return setDenied(d.error || "Not allowed");
    setSales(d.sales);
  }, [days]);
  useEffect(() => { if (me.user || me.team) load(); }, [me.user, me.team, load]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const s of sales || []) {
      const k = dayKey(s.created_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [sales]);

  const todayKey = dayKey(new Date().toISOString());
  const todays = sum(byDay.find(([k]) => k === todayKey)?.[1] || []);
  const range = sum(sales || []);
  const owners = useMemo(() => {
    const out = {};
    for (const s of sales || []) {
      const o = OWNERS[s.owner] !== undefined ? s.owner : "";
      out[o] = out[o] || [];
      out[o].push(s);
    }
    return Object.entries(out).map(([o, list]) => [o, sum(list)]);
  }, [sales]);
  // Shared items split 50/50 between Sam and Bear/Umer.
  const split = useMemo(() => {
    const get = o => owners.find(([k]) => k === o)?.[1] || { revenue: 0, profit: 0 };
    const sh = get("shared");
    return {
      sam: { revenue: get("sam").revenue + sh.revenue / 2, profit: get("sam").profit + sh.profit / 2 },
      bear: { revenue: get("bear_umer").revenue + sh.revenue / 2, profit: get("bear_umer").profit + sh.profit / 2 },
    };
  }, [owners]);

  async function undo(s) {
    if (!confirm(`Undo this sale (${s.quantity} × ${s.item_name}) and put it back in stock?`)) return;
    setMsg("");
    try { await postJSON("/api/admin/sales", { action: "void", id: s.id }); await load(); setMsg(`Undid ${s.item_name} — stock restored.`); }
    catch (e) { setMsg(`Error: ${e.message}`); }
  }

  function exportCSV() {
    const cols = ["date", "time", "item", "set", "type", "owner", "qty", "price_each", "total", "cost_each", "profit", "sold_by"];
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(",")].concat((sales || []).map(s => {
      const d = new Date(s.created_at);
      return [dayKey(s.created_at), d.toLocaleTimeString(), s.item_name, s.item_set, s.item_type, OWNERS[s.owner] || s.owner, s.quantity, s.price, s.total, s.item_cost, profitOf(s).toFixed(2), s.sold_by].map(esc).join(",");
    }));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `bearded-bear-sales-${todayKey}.csv` });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  if (!me.loading && !me.user && !me.team) return <Layout title="Sales"><AdminGate /></Layout>;
  if (denied) return <Layout title="Sales"><section className="wrap section"><p className="error">{denied}</p></section></Layout>;
  if (!sales) return <Layout title="Sales"><section className="wrap section"><p className="muted">Loading…</p></section></Layout>;

  return (
    <Layout title="Sales">
      <section className="wrap section admin">
        <div className="admin-head">
          <h1 className="page-title">Sales</h1>
          <span className="admin-links"><Link href="/admin/store" className="btn btn-small btn-ghost-dark">← Inventory</Link> <Link href="/admin/packs" className="btn btn-small btn-ghost-dark">Packs admin →</Link></span>
        </div>
        {msg && <p className={msg.startsWith("Error") ? "error" : "banner light"}>{msg}</p>}

        <div className="sales-today">
          <div><span className="muted small">Today</span><b>{money(todays.revenue)}</b><span className="small muted">{todays.count} sale{todays.count === 1 ? "" : "s"} · {todays.units} item{todays.units === 1 ? "" : "s"} · {money(todays.profit)} profit</span></div>
          <div><span className="muted small">Last {RANGES.find(r => r.days === days)?.label}</span><b>{money(range.revenue)}</b><span className="small muted">{range.count} sales · {money(range.profit)} profit</span></div>
          <div><span className="muted small">Sam’s share</span><b>{money(split.sam.revenue)}</b><span className="small muted">{money(split.sam.profit)} profit</span></div>
          <div><span className="muted small">Bear / Umer’s share</span><b>{money(split.bear.revenue)}</b><span className="small muted">{money(split.bear.profit)} profit</span></div>
        </div>
        <p className="muted small">Shares count Shared 50/50 items half each. Profit = sale price − the cost entered on the item (items without a cost count as all profit).</p>

        <div className="sales-controls">
          <div className="seg-light">{RANGES.map(r => <button key={r.days} className={r.days === days ? "on" : ""} onClick={() => setDays(r.days)}>{r.label}</button>)}</div>
          <button className="btn btn-small btn-ghost-dark" onClick={exportCSV} disabled={!sales.length}>⬇ Export CSV</button>
        </div>

        {!byDay.length && <p className="muted">No sales in this period yet. Record them from Inventory → 📷 Record sales, or with Sold 1 on a card.</p>}
        <div className="days">
          {byDay.map(([k, list]) => {
            const t = sum(list);
            const isOpen = open === k;
            return (
              <div key={k} className={`day${isOpen ? " open" : ""}`}>
                <button className="day-head" onClick={() => setOpen(isOpen ? "" : k)}>
                  <span className="day-name">{k === todayKey ? "Today" : dayLabel(k)}</span>
                  <span className="muted small">{t.count} sale{t.count === 1 ? "" : "s"} · {t.units} item{t.units === 1 ? "" : "s"}</span>
                  <span className="day-total">{money(t.revenue)}</span>
                  <span className="day-profit small">{money(t.profit)} profit</span>
                </button>
                {isOpen && (
                  <ul className="day-sales">
                    {list.map(s => (
                      <li key={s.id}>
                        {s.has_photo ? <a href={`/api/admin/sales?photo=${encodeURIComponent(s.id)}`} target="_blank" rel="noreferrer"><img src={`/api/admin/sales?photo=${encodeURIComponent(s.id)}`} alt="" loading="lazy" /></a> : <span className="no-photo" />}
                        <div className="sale-info">
                          <b>{s.quantity > 1 ? `${s.quantity} × ` : ""}{s.item_name}</b>
                          <span className="muted small">{[s.item_set, OWNERS[s.owner], s.sold_by && `sold by ${s.sold_by}`, new Date(s.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })].filter(Boolean).join(" · ")}</span>
                        </div>
                        <div className="sale-amt"><b>{money(s.total)}</b>{s.quantity > 1 && <span className="muted small">{money(s.price)} each</span>}</div>
                        <button className="link-button" onClick={() => undo(s)}>Undo</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </Layout>
  );
}
