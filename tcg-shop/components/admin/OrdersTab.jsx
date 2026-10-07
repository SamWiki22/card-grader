import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { money } from "../../lib/pricing";

const STATUS_BADGE = { pending_payment: "warn", paid: "ok", paid_short: "bad", shipped: "ok", cancelled: "" };

export default function OrdersTab() {
  const [orders, setOrders] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    let q = supabase.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(200);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) setError(error.message);
    setOrders(data || []);
  };
  useEffect(() => { load(); }, [status]);

  const act = async fn => {
    setError("");
    const { error } = await fn();
    if (error) setError(error.message);
    load();
  };

  return (
    <div className="stack">
      <div className="row">
        <select value={status} onChange={e => setStatus(e.target.value)} style={{ maxWidth: 220 }}>
          <option value="">All orders</option>
          {Object.keys(STATUS_BADGE).map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
        <button className="btn small" onClick={load}>Refresh</button>
      </div>
      {error && <div className="error">{error}</div>}
      {(orders || []).map(o => (
        <div key={o.id} className="card stack">
          <div className="spread">
            <div>
              <strong>#{o.id.slice(0, 8)}</strong> · {o.name || "—"} · <a href={`mailto:${o.email}`}>{o.email}</a>
              <div className="small muted">{new Date(o.created_at).toLocaleString()} {o.stripe_session_id ? "· Stripe" : "· manual payment"}</div>
            </div>
            <div className="row">
              <span className={`badge ${STATUS_BADGE[o.status]}`}>{o.status.replace("_", " ")}</span>
              <span className="price">{money(o.total)}</span>
            </div>
          </div>
          <table><tbody>
            {o.order_items.map(i => <tr key={i.id}><td>{i.quantity}×</td><td>{i.name}</td><td>{money(i.unit_price)}</td></tr>)}
          </tbody></table>
          {o.note && <div className="small">Note: {o.note}</div>}
          {o.status === "paid_short" && <div className="small error">Something sold out before this order was paid: check stock and refund or substitute.</div>}
          <div className="row">
            {o.status === "pending_payment" && (
              <>
                <button className="btn small primary" onClick={() => act(() => supabase.rpc("fulfill_order", { p_order: o.id }))}>Mark paid (takes stock)</button>
                <button className="btn small danger" onClick={() => act(() => supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id))}>Cancel</button>
              </>
            )}
            {(o.status === "paid" || o.status === "paid_short") && (
              <button className="btn small" onClick={() => act(() => supabase.from("orders").update({ status: "shipped" }).eq("id", o.id))}>Mark shipped</button>
            )}
          </div>
        </div>
      ))}
      {orders && !orders.length && <p className="muted">No orders.</p>}
    </div>
  );
}
