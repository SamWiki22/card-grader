import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

// ── Constants / helpers ──────────────────────────────────────────────────

const COLORS = {
  bg: "#F7F8FA",
  card: "#FFFFFF",
  border: "#E4E7EC",
  ink: "#1A2332",
  sub: "#66707E",
  primary: "#1F5C4C",
  primaryDark: "#153F34",
  gold: "#C9A227",
  gain: "#1E8E5A",
  loss: "#C0392B",
  stocksAccent: "#2E6BE6",
  cdsAccent: "#C9A227",
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function num(n) { return Number(n) || 0; }
function money(n) {
  const v = num(n);
  const sign = v < 0 ? "-" : "";
  return sign + "$" + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n) {
  const v = num(n);
  const sign = v > 0 ? "+" : "";
  return sign + v.toFixed(2) + "%";
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function addMonths(dateStr, months) {
  const d = dateStr ? new Date(dateStr) : new Date();
  d.setMonth(d.getMonth() + num(months));
  return d.toISOString().slice(0, 10);
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const ms = new Date(dateStr + "T00:00:00") - new Date(todayStr() + "T00:00:00");
  return Math.round(ms / 86400000);
}

// ── Row <-> app object mapping ───────────────────────────────────────────

function stockFromRow(row) {
  return {
    id: row.id,
    ticker: row.ticker || "",
    name: row.name || "",
    shares: row.shares ?? 0,
    costBasis: row.cost_basis ?? 0,
    currentPrice: row.current_price ?? 0,
    notes: row.notes || "",
  };
}
function stockToRow(s) {
  return {
    id: s.id,
    ticker: (s.ticker || "").toUpperCase(),
    name: s.name || "",
    shares: num(s.shares),
    cost_basis: num(s.costBasis),
    current_price: num(s.currentPrice),
    notes: s.notes || "",
    updated_at: new Date().toISOString(),
  };
}
function cdFromRow(row) {
  return {
    id: row.id,
    bank: row.bank || "",
    principal: row.principal ?? 0,
    apy: row.apy ?? 0,
    termMonths: row.term_months ?? 0,
    openDate: row.open_date || "",
    maturityDate: row.maturity_date || "",
    notes: row.notes || "",
  };
}
function cdToRow(c) {
  return {
    id: c.id,
    bank: c.bank || "",
    principal: num(c.principal),
    apy: num(c.apy),
    term_months: num(c.termMonths),
    open_date: c.openDate || null,
    maturity_date: c.maturityDate || null,
    notes: c.notes || "",
    updated_at: new Date().toISOString(),
  };
}
function snapshotFromRow(row) {
  return {
    id: row.id,
    stocksValue: row.stocks_value ?? 0,
    cdsValue: row.cds_value ?? 0,
    totalValue: row.total_value ?? 0,
    createdAt: row.created_at,
  };
}

// ── Derived math ──────────────────────────────────────────────────────────

function stockValue(s) { return num(s.shares) * num(s.currentPrice); }
function stockGain(s) { return stockValue(s) - num(s.costBasis); }
function stockGainPct(s) { return num(s.costBasis) > 0 ? (stockGain(s) / num(s.costBasis)) * 100 : 0; }

// APY already reflects compounding, so estimate current accrued value by
// compounding annually over the elapsed fraction of a year since opening.
function cdCurrentValue(c) {
  const principal = num(c.principal);
  if (!c.openDate) return principal;
  const years = Math.max(0, (Date.now() - new Date(c.openDate + "T00:00:00").getTime()) / (365.25 * 86400000));
  return principal * Math.pow(1 + num(c.apy) / 100, years);
}
function cdMaturityValue(c) {
  const years = num(c.termMonths) / 12;
  return num(c.principal) * Math.pow(1 + num(c.apy) / 100, years);
}

export default function FinancialTracker() {
  const [stocks, setStocks] = useState([]);
  const [cds, setCds] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [stockDraft, setStockDraft] = useState(null); // null = closed, {} = new, object = editing
  const [cdDraft, setCdDraft] = useState(null);
  const snapshotSavedRef = useRef(false);

  // ── Load + realtime sync ──────────────────────────────────────────────
  useEffect(() => {
    if (!supabase) { setLoaded(true); return; }
    let active = true;

    (async () => {
      try {
        const [stocksRes, cdsRes, snapshotsRes] = await Promise.all([
          supabase.from("stocks").select("*"),
          supabase.from("cds").select("*"),
          supabase.from("net_worth_snapshots").select("*").order("created_at", { ascending: true }).limit(365),
        ]);
        if (!active) return;
        if (!stocksRes.error) setStocks((stocksRes.data || []).map(stockFromRow));
        if (!cdsRes.error) setCds((cdsRes.data || []).map(cdFromRow));
        if (!snapshotsRes.error) setSnapshots((snapshotsRes.data || []).map(snapshotFromRow));
      } catch (err) {
        console.error("Failed to load financial data from Supabase", err);
      } finally {
        if (active) setLoaded(true);
      }
    })();

    const stocksChannel = supabase.channel("stocks-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "stocks" }, payload => {
        setStocks(prev => {
          if (payload.eventType === "DELETE") return prev.filter(s => s.id !== payload.old.id);
          const updated = stockFromRow(payload.new);
          const idx = prev.findIndex(s => s.id === updated.id);
          if (idx === -1) return [...prev, updated];
          const next = [...prev]; next[idx] = updated; return next;
        });
      })
      .subscribe();

    const cdsChannel = supabase.channel("cds-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "cds" }, payload => {
        setCds(prev => {
          if (payload.eventType === "DELETE") return prev.filter(c => c.id !== payload.old.id);
          const updated = cdFromRow(payload.new);
          const idx = prev.findIndex(c => c.id === updated.id);
          if (idx === -1) return [...prev, updated];
          const next = [...prev]; next[idx] = updated; return next;
        });
      })
      .subscribe();

    const snapshotsChannel = supabase.channel("snapshots-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "net_worth_snapshots" }, payload => {
        setSnapshots(prev => [...prev, snapshotFromRow(payload.new)]);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(stocksChannel);
      supabase.removeChannel(cdsChannel);
      supabase.removeChannel(snapshotsChannel);
    };
  }, []);

  // ── Totals ────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const stocksValue = stocks.reduce((sum, s) => sum + stockValue(s), 0);
    const stocksCost = stocks.reduce((sum, s) => sum + num(s.costBasis), 0);
    const stocksGain = stocksValue - stocksCost;
    const cdsValue = cds.reduce((sum, c) => sum + cdCurrentValue(c), 0);
    const cdsPrincipal = cds.reduce((sum, c) => sum + num(c.principal), 0);
    const netWorth = stocksValue + cdsValue;
    return {
      stocksValue, stocksCost, stocksGain,
      stocksGainPct: stocksCost > 0 ? (stocksGain / stocksCost) * 100 : 0,
      cdsValue, cdsPrincipal, cdsGain: cdsValue - cdsPrincipal,
      netWorth,
      stocksShare: netWorth > 0 ? (stocksValue / netWorth) * 100 : 0,
      cdsShare: netWorth > 0 ? (cdsValue / netWorth) * 100 : 0,
    };
  }, [stocks, cds]);

  // ── Auto snapshot once per day ────────────────────────────────────────
  useEffect(() => {
    if (!loaded || !supabase || snapshotSavedRef.current) return;
    if (stocks.length === 0 && cds.length === 0) return;
    const last = snapshots[snapshots.length - 1];
    const lastDay = last?.createdAt ? new Date(last.createdAt).toISOString().slice(0, 10) : null;
    if (lastDay === todayStr()) { snapshotSavedRef.current = true; return; }
    snapshotSavedRef.current = true;
    saveSnapshot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, stocks, cds]);

  async function saveSnapshot() {
    if (!supabase) return;
    const row = {
      id: uid(),
      stocks_value: totals.stocksValue,
      cds_value: totals.cdsValue,
      total_value: totals.netWorth,
    };
    const { data, error } = await supabase.from("net_worth_snapshots").insert(row).select().single();
    if (!error && data) setSnapshots(prev => [...prev, snapshotFromRow(data)]);
  }

  // ── Stock CRUD ────────────────────────────────────────────────────────
  function openNewStock() { setStockDraft({ ticker: "", name: "", shares: "", costBasis: "", currentPrice: "", notes: "" }); }
  function openEditStock(s) { setStockDraft({ ...s, shares: String(s.shares), costBasis: String(s.costBasis), currentPrice: String(s.currentPrice) }); }
  function closeStockDraft() { setStockDraft(null); }

  async function saveStockDraft() {
    const clean = {
      id: stockDraft.id || uid(),
      ticker: (stockDraft.ticker || "").trim().toUpperCase(),
      name: (stockDraft.name || "").trim(),
      shares: num(stockDraft.shares),
      costBasis: num(stockDraft.costBasis),
      currentPrice: num(stockDraft.currentPrice),
      notes: (stockDraft.notes || "").trim(),
    };
    if (!clean.ticker) { alert("Enter a ticker symbol."); return; }
    const isNew = !stockDraft.id;
    if (isNew) {
      setStocks(prev => [...prev, clean]);
      closeStockDraft();
      if (supabase) {
        const { error } = await supabase.from("stocks").insert(stockToRow(clean));
        if (error) { alert("Couldn't save to the database: " + error.message); setStocks(prev => prev.filter(s => s.id !== clean.id)); }
      }
    } else {
      setStocks(prev => prev.map(s => (s.id === clean.id ? clean : s)));
      closeStockDraft();
      if (supabase) {
        const { error } = await supabase.from("stocks").update(stockToRow(clean)).eq("id", clean.id);
        if (error) alert("Couldn't save changes to the database: " + error.message);
      }
    }
  }

  async function deleteStockDraft() {
    if (!stockDraft?.id) return;
    if (!window.confirm(`Remove ${stockDraft.ticker || "this stock"} from your holdings?`)) return;
    const id = stockDraft.id;
    setStocks(prev => prev.filter(s => s.id !== id));
    closeStockDraft();
    if (supabase) {
      const { error } = await supabase.from("stocks").delete().eq("id", id);
      if (error) alert("Couldn't delete from the database: " + error.message);
    }
  }

  // ── CD CRUD ───────────────────────────────────────────────────────────
  function openNewCD() {
    const open = todayStr();
    setCdDraft({ bank: "", principal: "", apy: "", termMonths: "12", openDate: open, maturityDate: addMonths(open, 12), notes: "" });
  }
  function openEditCD(c) { setCdDraft({ ...c, principal: String(c.principal), apy: String(c.apy), termMonths: String(c.termMonths) }); }
  function closeCdDraft() { setCdDraft(null); }

  function onCdTermOrOpenChange(patch) {
    setCdDraft(prev => {
      const next = { ...prev, ...patch };
      if (next.openDate && next.termMonths) next.maturityDate = addMonths(next.openDate, next.termMonths);
      return next;
    });
  }

  async function saveCdDraft() {
    const clean = {
      id: cdDraft.id || uid(),
      bank: (cdDraft.bank || "").trim(),
      principal: num(cdDraft.principal),
      apy: num(cdDraft.apy),
      termMonths: num(cdDraft.termMonths),
      openDate: cdDraft.openDate || "",
      maturityDate: cdDraft.maturityDate || "",
      notes: (cdDraft.notes || "").trim(),
    };
    if (!clean.bank) { alert("Enter a bank / institution name."); return; }
    if (clean.principal <= 0) { alert("Enter the CD's principal amount."); return; }
    const isNew = !cdDraft.id;
    if (isNew) {
      setCds(prev => [...prev, clean]);
      closeCdDraft();
      if (supabase) {
        const { error } = await supabase.from("cds").insert(cdToRow(clean));
        if (error) { alert("Couldn't save to the database: " + error.message); setCds(prev => prev.filter(c => c.id !== clean.id)); }
      }
    } else {
      setCds(prev => prev.map(c => (c.id === clean.id ? clean : c)));
      closeCdDraft();
      if (supabase) {
        const { error } = await supabase.from("cds").update(cdToRow(clean)).eq("id", clean.id);
        if (error) alert("Couldn't save changes to the database: " + error.message);
      }
    }
  }

  async function deleteCdDraft() {
    if (!cdDraft?.id) return;
    if (!window.confirm(`Remove the ${cdDraft.bank || "CD"} account?`)) return;
    const id = cdDraft.id;
    setCds(prev => prev.filter(c => c.id !== id));
    closeCdDraft();
    if (supabase) {
      const { error } = await supabase.from("cds").delete().eq("id", id);
      if (error) alert("Couldn't delete from the database: " + error.message);
    }
  }

  if (!loaded) {
    return <div style={styles.loading}>Loading…</div>;
  }

  return (
    <div style={styles.page}>
      {!supabase && (
        <div style={styles.warnBanner}>
          Not connected to a database — set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (see .env.example) to save data.
        </div>
      )}

      <header style={styles.header}>
        <div>
          <div style={styles.eyebrow}>Financial Tracker</div>
          <div style={styles.netWorth}>{money(totals.netWorth)}</div>
          <div style={styles.netWorthSub}>Total net worth</div>
        </div>
        <button style={styles.snapshotBtn} onClick={saveSnapshot}>Save snapshot</button>
      </header>

      <div style={styles.summaryRow}>
        <SummaryCard
          label="Stocks"
          value={money(totals.stocksValue)}
          sub={`${pct(totals.stocksGainPct)} (${money(totals.stocksGain)})`}
          subColor={totals.stocksGain >= 0 ? COLORS.gain : COLORS.loss}
          accent={COLORS.stocksAccent}
        />
        <SummaryCard
          label="CD Accounts"
          value={money(totals.cdsValue)}
          sub={`${cds.length} account${cds.length === 1 ? "" : "s"} · est. accrued ${money(totals.cdsGain)}`}
          subColor={COLORS.sub}
          accent={COLORS.cdsAccent}
        />
        <AllocationCard stocksShare={totals.stocksShare} cdsShare={totals.cdsShare} />
      </div>

      <HistoryChart snapshots={snapshots} />

      <Section
        title="Stocks"
        countLabel={`${stocks.length} holding${stocks.length === 1 ? "" : "s"}`}
        onAdd={openNewStock}
        addLabel="+ Add stock"
      >
        {stocks.length === 0 ? (
          <EmptyState text="No stocks yet. Add the first holding to start tracking." />
        ) : (
          <div style={styles.list}>
            {[...stocks].sort((a, b) => a.ticker.localeCompare(b.ticker)).map(s => {
              const value = stockValue(s);
              const gain = stockGain(s);
              const gp = stockGainPct(s);
              return (
                <div key={s.id} style={styles.row} onClick={() => openEditStock(s)}>
                  <div style={styles.rowMain}>
                    <div style={styles.rowTitle}>{s.ticker}</div>
                    {s.name && <div style={styles.rowSub}>{s.name}</div>}
                    <div style={styles.rowMeta}>{num(s.shares).toLocaleString()} sh @ {money(s.currentPrice)}</div>
                  </div>
                  <div style={styles.rowEnd}>
                    <div style={styles.rowValue}>{money(value)}</div>
                    <div style={{ ...styles.rowGain, color: gain >= 0 ? COLORS.gain : COLORS.loss }}>
                      {pct(gp)} · {money(gain)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section
        title="CD Accounts"
        countLabel={`${cds.length} account${cds.length === 1 ? "" : "s"}`}
        onAdd={openNewCD}
        addLabel="+ Add CD"
      >
        {cds.length === 0 ? (
          <EmptyState text="No CD accounts yet. Add one to start tracking." />
        ) : (
          <div style={styles.list}>
            {[...cds].sort((a, b) => (a.maturityDate || "").localeCompare(b.maturityDate || "")).map(c => {
              const current = cdCurrentValue(c);
              const dLeft = daysUntil(c.maturityDate);
              const matured = dLeft !== null && dLeft < 0;
              return (
                <div key={c.id} style={styles.row} onClick={() => openEditCD(c)}>
                  <div style={styles.rowMain}>
                    <div style={styles.rowTitle}>{c.bank}</div>
                    <div style={styles.rowSub}>{c.apy}% APY · {c.termMonths}mo term</div>
                    <div style={styles.rowMeta}>
                      {matured
                        ? <span style={{ color: COLORS.loss }}>Matured {c.maturityDate}</span>
                        : dLeft !== null
                          ? `Matures ${c.maturityDate} (${dLeft}d)`
                          : "No maturity date set"}
                    </div>
                  </div>
                  <div style={styles.rowEnd}>
                    <div style={styles.rowValue}>{money(current)}</div>
                    <div style={styles.rowGainNeutral}>principal {money(c.principal)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {stockDraft && (
        <StockFormModal
          draft={stockDraft}
          setDraft={setStockDraft}
          onSave={saveStockDraft}
          onDelete={stockDraft.id ? deleteStockDraft : null}
          onClose={closeStockDraft}
        />
      )}
      {cdDraft && (
        <CDFormModal
          draft={cdDraft}
          setDraft={setCdDraft}
          onTermOrOpenChange={onCdTermOrOpenChange}
          onSave={saveCdDraft}
          onDelete={cdDraft.id ? deleteCdDraft : null}
          onClose={closeCdDraft}
        />
      )}
    </div>
  );
}

// ── Small presentational pieces ───────────────────────────────────────────

function SummaryCard({ label, value, sub, subColor, accent }) {
  return (
    <div style={{ ...styles.summaryCard, borderTopColor: accent }}>
      <div style={styles.summaryLabel}>{label}</div>
      <div style={styles.summaryValue}>{value}</div>
      <div style={{ ...styles.summarySub, color: subColor }}>{sub}</div>
    </div>
  );
}

function AllocationCard({ stocksShare, cdsShare }) {
  return (
    <div style={styles.summaryCard}>
      <div style={styles.summaryLabel}>Allocation</div>
      <div style={styles.allocBar}>
        <div style={{ ...styles.allocSeg, width: `${stocksShare}%`, background: COLORS.stocksAccent }} />
        <div style={{ ...styles.allocSeg, width: `${cdsShare}%`, background: COLORS.cdsAccent }} />
      </div>
      <div style={styles.allocLegend}>
        <span><i style={{ ...styles.dot, background: COLORS.stocksAccent }} /> Stocks {stocksShare.toFixed(0)}%</span>
        <span><i style={{ ...styles.dot, background: COLORS.cdsAccent }} /> CDs {cdsShare.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function Section({ title, countLabel, onAdd, addLabel, children }) {
  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <div>
          <div style={styles.sectionTitle}>{title}</div>
          <div style={styles.sectionCount}>{countLabel}</div>
        </div>
        <button style={styles.addBtn} onClick={onAdd}>{addLabel}</button>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return <div style={styles.empty}>{text}</div>;
}

function HistoryChart({ snapshots }) {
  if (snapshots.length < 2) {
    return (
      <section style={styles.section}>
        <div style={styles.sectionTitle}>Net worth history</div>
        <EmptyState text="History builds up as snapshots are saved (one is captured automatically each day)." />
      </section>
    );
  }
  const width = 640, height = 160, pad = 24;
  const values = snapshots.map(s => s.totalValue);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const points = snapshots.map((s, i) => {
    const x = pad + (i / (snapshots.length - 1)) * (width - pad * 2);
    const y = height - pad - ((s.totalValue - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  });
  const first = snapshots[0], last = snapshots[snapshots.length - 1];
  const changeUp = last.totalValue >= first.totalValue;

  return (
    <section style={styles.section}>
      <div style={styles.sectionHead}>
        <div>
          <div style={styles.sectionTitle}>Net worth history</div>
          <div style={styles.sectionCount}>{snapshots.length} snapshots</div>
        </div>
        <div style={{ color: changeUp ? COLORS.gain : COLORS.loss, fontWeight: 600 }}>
          {pct(first.totalValue > 0 ? ((last.totalValue - first.totalValue) / first.totalValue) * 100 : 0)}
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} style={styles.chart} preserveAspectRatio="none">
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke={changeUp ? COLORS.gain : COLORS.loss}
          strokeWidth="2"
        />
      </svg>
      <div style={styles.chartLabels}>
        <span>{new Date(first.createdAt).toLocaleDateString()}</span>
        <span>{new Date(last.createdAt).toLocaleDateString()}</span>
      </div>
    </section>
  );
}

function FieldRow({ label, children }) {
  return (
    <label style={styles.fieldRow}>
      <span style={styles.fieldLabel}>{label}</span>
      {children}
    </label>
  );
}

function StockFormModal({ draft, setDraft, onSave, onDelete, onClose }) {
  const set = patch => setDraft(prev => ({ ...prev, ...patch }));
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalTitle}>{draft.id ? "Edit stock" : "Add stock"}</div>
        <FieldRow label="Ticker">
          <input style={styles.input} value={draft.ticker} onChange={e => set({ ticker: e.target.value.toUpperCase() })} placeholder="AAPL" autoFocus />
        </FieldRow>
        <FieldRow label="Company name (optional)">
          <input style={styles.input} value={draft.name} onChange={e => set({ name: e.target.value })} placeholder="Apple Inc." />
        </FieldRow>
        <FieldRow label="Shares owned">
          <input style={styles.input} type="number" inputMode="decimal" value={draft.shares} onChange={e => set({ shares: e.target.value })} placeholder="0" />
        </FieldRow>
        <FieldRow label="Total cost basis ($)">
          <input style={styles.input} type="number" inputMode="decimal" value={draft.costBasis} onChange={e => set({ costBasis: e.target.value })} placeholder="0.00" />
        </FieldRow>
        <FieldRow label="Current price per share ($)">
          <input style={styles.input} type="number" inputMode="decimal" value={draft.currentPrice} onChange={e => set({ currentPrice: e.target.value })} placeholder="0.00" />
        </FieldRow>
        <FieldRow label="Notes (optional)">
          <textarea style={styles.textarea} value={draft.notes} onChange={e => set({ notes: e.target.value })} rows={2} />
        </FieldRow>
        <div style={styles.modalActions}>
          {onDelete && <button style={styles.deleteBtn} onClick={onDelete}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function CDFormModal({ draft, setDraft, onTermOrOpenChange, onSave, onDelete, onClose }) {
  const set = patch => setDraft(prev => ({ ...prev, ...patch }));
  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalTitle}>{draft.id ? "Edit CD account" : "Add CD account"}</div>
        <FieldRow label="Bank / institution">
          <input style={styles.input} value={draft.bank} onChange={e => set({ bank: e.target.value })} placeholder="Ally Bank" autoFocus />
        </FieldRow>
        <FieldRow label="Principal ($)">
          <input style={styles.input} type="number" inputMode="decimal" value={draft.principal} onChange={e => set({ principal: e.target.value })} placeholder="0.00" />
        </FieldRow>
        <FieldRow label="APY (%)">
          <input style={styles.input} type="number" inputMode="decimal" value={draft.apy} onChange={e => set({ apy: e.target.value })} placeholder="0.00" />
        </FieldRow>
        <FieldRow label="Term (months)">
          <input style={styles.input} type="number" inputMode="numeric" value={draft.termMonths} onChange={e => onTermOrOpenChange({ termMonths: e.target.value })} placeholder="12" />
        </FieldRow>
        <FieldRow label="Open date">
          <input style={styles.input} type="date" value={draft.openDate} onChange={e => onTermOrOpenChange({ openDate: e.target.value })} />
        </FieldRow>
        <FieldRow label="Maturity date">
          <input style={styles.input} type="date" value={draft.maturityDate} onChange={e => set({ maturityDate: e.target.value })} />
        </FieldRow>
        <FieldRow label="Notes (optional)">
          <textarea style={styles.textarea} value={draft.notes} onChange={e => set({ notes: e.target.value })} rows={2} />
        </FieldRow>
        <div style={styles.modalActions}>
          {onDelete && <button style={styles.deleteBtn} onClick={onDelete}>Delete</button>}
          <div style={{ flex: 1 }} />
          <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
          <button style={styles.saveBtn} onClick={onSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────

const styles = {
  page: { minHeight: "100vh", background: COLORS.bg, color: COLORS.ink, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", padding: "16px 16px 48px", maxWidth: 720, margin: "0 auto" },
  loading: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.sub, fontFamily: "sans-serif" },
  warnBanner: { background: "#FFF4E5", color: "#8A5A00", border: "1px solid #F0D9A8", borderRadius: 10, padding: "10px 14px", fontSize: 13, marginBottom: 16 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "12px 4px 20px" },
  eyebrow: { fontSize: 13, fontWeight: 600, color: COLORS.primary, letterSpacing: 0.4, textTransform: "uppercase" },
  netWorth: { fontSize: 38, fontWeight: 700, marginTop: 4, letterSpacing: -0.5 },
  netWorthSub: { fontSize: 13, color: COLORS.sub, marginTop: 2 },
  snapshotBtn: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: COLORS.primary, cursor: "pointer", height: "fit-content" },

  summaryRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 },
  summaryCard: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderTop: "3px solid transparent", borderRadius: 14, padding: "14px 16px" },
  summaryLabel: { fontSize: 12, color: COLORS.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  summaryValue: { fontSize: 22, fontWeight: 700, marginTop: 6 },
  summarySub: { fontSize: 12.5, marginTop: 4, fontWeight: 500 },

  allocBar: { display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginTop: 10, background: COLORS.border },
  allocSeg: { height: "100%" },
  allocLegend: { display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: COLORS.sub },
  dot: { display: "inline-block", width: 8, height: 8, borderRadius: 4, marginRight: 5 },

  section: { background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 14, padding: 16, marginBottom: 16 },
  sectionHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 700 },
  sectionCount: { fontSize: 12.5, color: COLORS.sub, marginTop: 2 },
  addBtn: { background: COLORS.primary, color: "#fff", border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },

  empty: { color: COLORS.sub, fontSize: 13.5, padding: "14px 4px" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, border: `1px solid ${COLORS.border}`, cursor: "pointer" },
  rowMain: { display: "flex", flexDirection: "column", gap: 2 },
  rowTitle: { fontWeight: 700, fontSize: 14.5 },
  rowSub: { fontSize: 12.5, color: COLORS.sub },
  rowMeta: { fontSize: 12, color: COLORS.sub },
  rowEnd: { textAlign: "right", display: "flex", flexDirection: "column", gap: 2 },
  rowValue: { fontWeight: 700, fontSize: 14.5 },
  rowGain: { fontSize: 12.5, fontWeight: 600 },
  rowGainNeutral: { fontSize: 12, color: COLORS.sub },

  chart: { width: "100%", height: 160, marginTop: 4 },
  chartLabels: { display: "flex", justifyContent: "space-between", fontSize: 11.5, color: COLORS.sub, marginTop: 2 },

  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,32,0.45)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 },
  modal: { background: COLORS.card, width: "100%", maxWidth: 480, borderRadius: "16px 16px 0 0", padding: "20px 18px 24px", maxHeight: "90vh", overflowY: "auto" },
  modalTitle: { fontSize: 17, fontWeight: 700, marginBottom: 14 },
  fieldRow: { display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 },
  fieldLabel: { fontSize: 12.5, color: COLORS.sub, fontWeight: 600 },
  input: { border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 14.5, color: COLORS.ink, background: "#FBFBFC" },
  textarea: { border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "9px 11px", fontSize: 14, color: COLORS.ink, background: "#FBFBFC", resize: "vertical", fontFamily: "inherit" },
  modalActions: { display: "flex", alignItems: "center", gap: 8, marginTop: 12 },
  deleteBtn: { background: "transparent", color: COLORS.loss, border: "none", fontSize: 13.5, fontWeight: 600, cursor: "pointer", padding: "8px 4px" },
  cancelBtn: { background: "transparent", color: COLORS.sub, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" },
  saveBtn: { background: COLORS.primary, color: "#fff", border: "none", borderRadius: 9, padding: "9px 18px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
};
