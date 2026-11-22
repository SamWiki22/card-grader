import { useState } from "react";
import { postJSON } from "../lib/me";
import { money, GAME_LABEL } from "../lib/shared";

const OWNER = { sam: "Sam", bear_umer: "Bear / Umer", shared: "Shared 50/50" };

// "Combine duplicates": the same card listed more than once becomes one listing with the total quantity.
export default function CombineDuplicates({ onDone }) {
  const [groups, setGroups] = useState(null);
  const [off, setOff] = useState({});
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");

  async function find() {
    setBusy("Looking for duplicates…"); setMsg(""); setOff({});
    try { setGroups((await postJSON("/api/admin/items", { action: "duplicates" })).groups); }
    catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy("");
  }
  async function merge() {
    const picked = groups.filter(g => !off[g.keep.id]);
    if (!picked.length) return setMsg("Nothing ticked.");
    setBusy(`Combining ${picked.length}…`); setMsg("");
    try {
      const r = await postJSON("/api/admin/items", { action: "merge", groups: picked.map(g => ({ keep: g.keep.id, ids: g.others.map(o => o.id) })) });
      setGroups(null);
      onDone?.(`Combined ${r.merged} card${r.merged === 1 ? "" : "s"} (${r.listings} extra listing${r.listings === 1 ? "" : "s"} removed).${r.problems.length ? " " + r.problems.join(" ") : ""}`);
    } catch (e) { setMsg(`Error: ${e.message}`); }
    setBusy("");
  }

  if (!groups) return (
    <>
      <button className="btn btn-ghost-dark" onClick={find} disabled={!!busy}>{busy || "⧉ Combine duplicates"}</button>
      {msg && <p className="error small">{msg}</p>}
    </>
  );
  const ticked = groups.filter(g => !off[g.keep.id]).length;
  return (
    <div className="fill-nums">
      <div className="fill-nums-head">
        <b>Combine duplicates</b>
        <button className="btn btn-small btn-ghost-dark" onClick={() => setGroups(null)} disabled={!!busy}>Close</button>
      </div>
      {!groups.length ? <p className="small">No duplicate listings found. 🎉</p> : (
        <>
          <p className="small">{groups.length} card{groups.length === 1 ? " is" : "s are"} listed more than once. Same name, set, condition, foil and owner are combined into one listing with the total quantity. Cards with a different owner are never combined.</p>
          <p className="muted small">Tip: run “# Fill in numbers &amp; rarity” first, so “Card” and “Card 123” count as the same card.</p>
          <div className="fill-nums-bar">
            <button className="btn btn-small btn-ghost-dark" onClick={() => setOff({})}>Tick all</button>
            <button className="btn btn-small btn-ghost-dark" onClick={() => setOff(Object.fromEntries(groups.map(g => [g.keep.id, true])))}>Untick all</button>
          </div>
          <ul className="fill-nums-list">
            {groups.map(g => (
              <li key={g.keep.id}>
                <label>
                  <input type="checkbox" checked={!off[g.keep.id]} onChange={e => setOff(o => ({ ...o, [g.keep.id]: !e.target.checked }))} />
                  <span>
                    <b>{g.keep.name}</b>
                    <span className="muted small"> · {[g.keep.set_name, g.type === "single" ? g.keep.condition || "NM" : "Sealed", GAME_LABEL[g.game], OWNER[g.owner]].filter(Boolean).join(" · ")}</span>
                    <br />
                    <span className="small">{g.others.length + 1} listings → <b>1 listing, qty {g.total}</b> at <b>{money(g.price)}</b>
                      {g.prices.length > 1 && <span className="muted"> (prices were {g.prices.map(money).join(", ")})</span>}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {!busy && <button className="btn" onClick={merge} disabled={!ticked}>Combine {ticked} card{ticked === 1 ? "" : "s"}</button>}
        </>
      )}
      {busy && <p className="muted small">{busy}</p>}
      {msg && <p className="error small">{msg}</p>}
    </div>
  );
}
