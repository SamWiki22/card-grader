import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import Layout from "../components/Layout";
import ProductCard from "../components/ProductCard";
import { listProducts } from "../lib/catalog";
import { GAMES, CATEGORIES } from "../lib/shared";

const PAGE_SIZE = 48;
const SORTS = [
  { id: "new", label: "Newest" },
  { id: "price-asc", label: "Price: low → high" },
  { id: "price-desc", label: "Price: high → low" },
  { id: "name", label: "Name A → Z" },
];
const PRICES = [
  { id: "u1", label: "Under $1", min: 0, max: 1 },
  { id: "1-5", label: "$1 – $5", min: 1, max: 5 },
  { id: "5-20", label: "$5 – $20", min: 5, max: 20 },
  { id: "20-100", label: "$20 – $100", min: 20, max: 100 },
  { id: "100", label: "$100+", min: 100, max: Infinity },
];
const CONDITIONS = [
  { id: "NM", label: "Near Mint" }, { id: "LP", label: "Lightly Played" }, { id: "MP", label: "Moderately Played" },
  { id: "HP", label: "Heavily Played" }, { id: "DMG", label: "Damaged" }, { id: "graded", label: "Graded (PSA, BGS, CGC…)" },
];

// Search text: lowercase, accents and punctuation removed, so "lim dul" finds "Lim-Dûl's Vault".
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim();
const condOf = c => (/^(psa|bgs|cgc|sgc|tag|beckett)/i.test(c || "") ? "graded" : (String(c || "").toUpperCase().match(/\b(NM|LP|MP|HP|DMG)\b/) || [])[1] || "");

export default function Shop({ products, category, game, q, sort, set, cond, price, page, pages, matched, total, sets }) {
  const router = useRouter();
  const [search, setSearch] = useState(q);
  const timer = useRef(null);
  useEffect(() => setSearch(q), [q]);

  function update(changes, push = true) {
    const next = { category, game, q, sort, set, cond, price, page: 1, ...changes };
    const query = Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === "sort" && v === "new") && !(k === "page" && Number(v) === 1)));
    router[push ? "push" : "replace"]({ pathname: "/shop", query }, undefined, { scroll: false });
  }
  // Search as you type (a short pause after the last keystroke).
  function onSearch(v) {
    setSearch(v);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: v.trim() }, false), 350);
  }
  const anyFilter = q || category || game || set || cond || price;

  const heading = [game && GAMES.find(g => g.id === game)?.label, category && CATEGORIES[category].label].filter(Boolean).join(" ") || "All products";
  const from = matched ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(matched, page * PAGE_SIZE);

  return (
    <Layout title={heading}>
      <section className="wrap section">
        <h1 className="page-title">{heading}</h1>
        <form className="filters" onSubmit={e => { e.preventDefault(); clearTimeout(timer.current); update({ q: search.trim() }); }}>
          <input className="input search" type="search" placeholder="Search card name, set or number…" value={search} onChange={e => onSearch(e.target.value)} aria-label="Search" enterKeyHint="search" />
          <select className="input" value={game} onChange={e => update({ game: e.target.value, set: "" })} aria-label="Game">
            <option value="">All games</option>
            {GAMES.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
          <select className="input" value={category} onChange={e => update({ category: e.target.value })} aria-label="Category">
            <option value="">Singles & sealed</option>
            {Object.entries(CATEGORIES).map(([id, c]) => <option key={id} value={id}>{c.label}</option>)}
          </select>
          <select className="input" value={set} onChange={e => update({ set: e.target.value })} aria-label="Set">
            <option value="">All sets{sets.length ? ` (${sets.length})` : ""}</option>
            {sets.map(s => <option key={s.name} value={s.name}>{s.name} ({s.count})</option>)}
          </select>
          <select className="input" value={cond} onChange={e => update({ cond: e.target.value })} aria-label="Condition">
            <option value="">Any condition</option>
            {CONDITIONS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select className="input" value={price} onChange={e => update({ price: e.target.value })} aria-label="Price">
            <option value="">Any price</option>
            {PRICES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select className="input" value={sort} onChange={e => update({ sort: e.target.value })} aria-label="Sort">
            {SORTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </form>
        <div className="result-bar">
          <p className="muted small result-count">{matched ? `${from}–${to} of ${matched.toLocaleString()}` : "0"} item{matched === 1 ? "" : "s"}{anyFilter ? ` (of ${total.toLocaleString()})` : ""}</p>
          {anyFilter && <Link href="/shop" className="small text-link">Clear filters</Link>}
        </div>
        {products.length ? (
          <>
            <div className="grid">{products.map(p => <ProductCard key={p.id} product={p} />)}</div>
            {pages > 1 && (
              <nav className="pager" aria-label="Pages">
                <button className="btn btn-small btn-ghost-dark" disabled={page <= 1} onClick={() => { update({ page: page - 1 }); window.scrollTo({ top: 0 }); }}>← Previous</button>
                <span className="muted small">Page {page} of {pages}</span>
                <button className="btn btn-small btn-ghost-dark" disabled={page >= pages} onClick={() => { update({ page: page + 1 }); window.scrollTo({ top: 0 }); }}>Next →</button>
              </nav>
            )}
          </>
        ) : (
          <div className="empty">
            <img src="/logo.png" alt="" width="96" height="96" />
            <p>Nothing matches that yet. Try another search{anyFilter ? <>, or <Link href="/shop" className="text-link">clear the filters</Link></> : ""}.</p>
          </div>
        )}
      </section>
    </Layout>
  );
}

export async function getServerSideProps({ query, res }) {
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  const one = v => (Array.isArray(v) ? v[0] : v) || "";
  const category = CATEGORIES[one(query.category)] ? one(query.category) : "";
  const game = GAMES.some(g => g.id === one(query.game)) ? one(query.game) : "";
  const q = one(query.q).slice(0, 100);
  const sort = SORTS.some(s => s.id === one(query.sort)) ? one(query.sort) : "new";
  const set = one(query.set).slice(0, 160);
  const cond = CONDITIONS.some(c => c.id === one(query.cond)) ? one(query.cond) : "";
  const price = PRICES.find(p => p.id === one(query.price))?.id || "";

  let all = [];
  try { all = await listProducts(); } catch (e) { console.error(e); }

  // Sets you actually have, for the chosen game/category (before the set filter itself).
  const scope = all.filter(p => (!category || p.category === category) && (!game || p.game === game));
  const setCounts = new Map();
  for (const p of scope) if (p.set) setCounts.set(p.set, (setCounts.get(p.set) || 0) + 1);
  const sets = [...setCounts].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));

  const terms = norm(q).split(/\s+/).filter(Boolean);
  const band = PRICES.find(p => p.id === price);
  let products = scope.filter(p =>
    (!set || p.set === set) &&
    (!cond || condOf(p.condition) === cond) &&
    (!band || (p.price >= band.min && p.price < band.max)) &&
    (!terms.length || (h => terms.every(t => h.includes(t)))(norm(`${p.name} ${p.set} ${p.condition}`)))
  );
  if (sort === "price-asc") products.sort((a, b) => a.price - b.price);
  if (sort === "price-desc") products.sort((a, b) => b.price - a.price);
  if (sort === "name") products.sort((a, b) => a.name.localeCompare(b.name));

  const matched = products.length;
  const pages = Math.max(1, Math.ceil(matched / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(one(query.page)) || 1)));
  products = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return { props: { products, category, game, q, sort, set, cond, price, page, pages, matched, total: all.length, sets } };
}
