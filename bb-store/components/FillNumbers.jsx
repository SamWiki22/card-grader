import { useState } from "react";
import { postJSON } from "../lib/me";

// "Fill in card numbers": looks every card without a number up on TCGplayer
// (by name + set), shows what it found, and saves only what you tick.
export default function FillNumbers({ where, onDone }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(null); // { found, choose, skipped, total, checked, done }
  const [busy, setBusy] = useState("");
  const [off, setOff] = useState({});       // id -> true when unticked
  const [pick, setPick] = useState({});     // id -> chosen "to" for cards with several printings
  const [showSkipped, setShowSkipped] = useState(false);
  const [msg, setMsg] = useState("");

  async function find() {
    setOpen(true); setMsg(""); setState(null); setOff({}); setPick({});
    const acc = { found: [], choose: [], skipped: [], total: 0, checked: 0, done: false };
    let from = 0;
    try {
      for (let round = 0; round < 60; round++) {
        setBusy(acc.total ? `Looking up cards on TCGplayer… ${Math.min(from, acc.total)} of ${acc.total}` : "Looking up cards on TCGplayer…");
        const r = await postJSON("/api/admin/card-numbers", { action: "find", where, from });
        acc.found.push(...r.found); acc.choose.push(...r.choose); acc.skipped.push(...r.skipped);
        acc.total = r.total; acc.checked = r.checked; acc.withRarity = r.withRarity;
        setState({ ...acc });
        if (r.done || r.next <= from) break;
        from = r.next;
      }
      acc.done = true; setState({ ...acc });
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy("");
  }

  async function save() {
    const changes = [
      ...state.found.filter(c => !off[c.id]).map(c => ({ id: c.id, from: c.from, to: c.to, fromSet: c.fromSet, toSet: c.toSet, rarity: c.rarity })),
      ...state.choose.filter(c => pick[c.id]).map(c => { const o = c.options.find(o => o.number === pick[c.id]); return { id: c.id, from: c.from, to: o.to, fromSet: c.fromSet, toSet: o.toSet, rarity: o.rarity }; }),
    ];
    if (!changes.length) return setMsg("Nothing ticked to save.");
    setBusy(`Saving ${changes.length}…`); setMsg("");
    try {
      const r = await postJSON("/api/admin/card-numbers", { action: "save", where, changes });
      setState(null); setOpen(false);
      onDone?.(`Updated ${r.saved} card${r.saved === 1 ? "" : "s"}${where === "store" ? " (numbers, sets, rarity — bulk cards raised to the standard price)" : ""}${r.skipped ? ` (${r.skipped} skipped because they were edited meanwhile)` : ""}.`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy("");
  }

  const label = where === "store" ? "Fill in numbers & rarity" : "Fill in card numbers";
  if (!open) return <button className="btn btn-ghost-dark" onClick={find}># {label}</button>;

  const ticked = state ? state.found.filter(c => !off[c.id]).length + state.choose.filter(c => pick[c.id]).length : 0;
  return (
    <div className="fill-nums">
      <div className="fill-nums-head">
        <b>{label}</b>
        <button className="btn btn-small btn-ghost-dark" onClick={() => { setOpen(false); setState(null); }} disabled={!!busy}>Close</button>
      </div>
      {busy && <p className="muted small">{busy}</p>}
      {msg && <p className={msg.startsWith("Error") ? "error small" : "small"}>{msg}</p>}
      {state && (
        <>
          <p className="small">
            {state.total === 0 ? `All ${state.checked} cards already have a number${state.withRarity ? " and rarity" : ""}. 🎉` :
              <>{state.total} of {state.checked} cards were missing a number{state.withRarity ? " or rarity" : ""}. Found <b>{state.found.length}</b>{state.choose.length ? <>, <b>{state.choose.length}</b> need you to pick the printing</> : ""}{state.skipped.length ? <>, {state.skipped.length} couldn’t be matched</> : ""}.</>}
          </p>
          {state.found.length > 0 && (
            <>
              <div className="fill-nums-bar">
                <button className="btn btn-small btn-ghost-dark" onClick={() => setOff({})}>Tick all</button>
                <button className="btn btn-small btn-ghost-dark" onClick={() => setOff(Object.fromEntries(state.found.map(c => [c.id, true])))}>Untick all</button>
              </div>
              <ul className="fill-nums-list">
                {state.found.map(c => (
                  <li key={c.id}>
                    <label><input type="checkbox" checked={!off[c.id]} onChange={e => setOff(o => ({ ...o, [c.id]: !e.target.checked }))} />
                      <span>
                        {c.from}
                        {c.to !== c.from && <> <span className="muted">→</span> <b>#{c.number}</b></>}
                        {c.rarity && <> <span className="rarity-tag">{c.rarity}</span></>}
                        <span className="muted small"> · {c.moved ? <>set fixed: “{c.fromSet}” → {c.set}</> : c.set}</span>
                      </span></label>
                  </li>
                ))}
              </ul>
            </>
          )}
          {state.choose.length > 0 && (
            <>
              <p className="small"><b>More than one printing</b> — pick the one you have (or leave it):</p>
              <ul className="fill-nums-list">
                {state.choose.map(c => (
                  <li key={c.id}>
                    <span>{c.from}<span className="muted small"> · {c.set}</span></span>
                    <select className="input input-sm" value={pick[c.id] || ""} onChange={e => setPick(p => ({ ...p, [c.id]: e.target.value }))}>
                      <option value="">Leave as is</option>
                      {c.options.map(o => <option key={o.number} value={o.number}>{o.label}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </>
          )}
          {state.skipped.length > 0 && (
            <p className="small"><button className="text-link small" onClick={() => setShowSkipped(s => !s)}>{showSkipped ? "Hide" : "Show"} the {state.skipped.length} not matched</button></p>
          )}
          {showSkipped && <ul className="fill-nums-list muted small">{state.skipped.map(s => <li key={s.id}>{s.name} — {s.why}</li>)}</ul>}
          {(state.found.length > 0 || state.choose.length > 0) && !busy && (
            <button className="btn" onClick={save} disabled={!ticked}>Save numbers on {ticked} card{ticked === 1 ? "" : "s"}</button>
          )}
        </>
      )}
    </div>
  );
}
