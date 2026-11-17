import { useEffect, useState } from "react";
import Link from "next/link";
import Layout from "../../components/Layout";
import { useMe } from "../../lib/me";

// Where the emailed sign-in link lands. Supabase puts the session in the URL
// fragment (#access_token=…), which only the browser can read, so we pass it
// to /api/auth/session and then go back to where the person was.
export default function AuthCallback() {
  const { refresh } = useMe();
  const [state, setState] = useState({ status: "working", error: "" });

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const err = hash.get("error_description") || query.get("error_description");
    if (err) return setState({ status: "error", error: err.replace(/\+/g, " ") });
    const access_token = hash.get("access_token"), refresh_token = hash.get("refresh_token");
    if (!access_token || !refresh_token) return setState({ status: "error", error: "This link is missing its sign-in details. Request a new one." });
    history.replaceState(null, "", window.location.pathname); // keep tokens out of history
    fetch("/api/auth/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token, refresh_token }) })
      .then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Sign-in failed.");
        await refresh();
        let next = "/packs";
        try { next = localStorage.getItem("bb-after-signin") || "/packs"; localStorage.removeItem("bb-after-signin"); } catch {}
        window.location.replace(next.startsWith("/") ? next : "/packs");
      })
      .catch(e => setState({ status: "error", error: e.message }));
  }, [refresh]);

  return (
    <Layout title="Signing in">
      <section className="wrap section empty">
        <img src="/logo.png" alt="" width="110" height="110" />
        {state.status === "working"
          ? <h1 className="page-title">Signing you in…</h1>
          : <><h1 className="page-title">Couldn’t sign you in</h1><p>{state.error}</p><div className="hero-ctas center"><Link href="/account" className="btn">Try again</Link></div></>}
      </section>
    </Layout>
  );
}
