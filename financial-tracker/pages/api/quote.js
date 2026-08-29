// Looks up a stock's closing price on (or just before) a given date, using
// Stooq's free, no-key-required historical data endpoint. Used both for
// "what did it cost on the day she bought it" and "what's it worth today"
// (today's price is just a lookup with date = today).

function normalizeSymbol(ticker) {
  const t = String(ticker || "").trim().toLowerCase();
  if (!t) return "";
  // Stooq needs a market suffix; ".us" covers NYSE/NASDAQ, which covers the
  // overwhelming majority of individual-investor holdings.
  return t.includes(".") ? t : `${t}.us`;
}

function fmt(d) { return d.toISOString().slice(0, 10).replace(/-/g, ""); }

async function fetchWindow(symbol, targetDate, lookbackDays) {
  const d2 = fmt(targetDate);
  const d1 = fmt(new Date(targetDate.getTime() - lookbackDays * 86400000));
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${d1}&d2=${d2}&i=d`;
  const resp = await fetch(url);
  const text = await resp.text();
  if (!resp.ok) return null;
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2 || !/^Date,/i.test(lines[0])) return null; // Stooq returns a plain error line, not a CSV header, when it has nothing
  const rows = lines.slice(1).map(l => l.split(","));
  return rows.length ? rows[rows.length - 1] : null; // most recent trading day on/before d2
}

export default async function handler(req, res) {
  const { ticker, date } = req.query;
  if (!ticker) return res.status(400).json({ error: "ticker is required" });

  const symbol = normalizeSymbol(ticker);
  const requested = date ? new Date(date + "T00:00:00Z") : new Date();
  const targetDate = requested.getTime() > Date.now() ? new Date() : requested;

  try {
    // Weekends/market holidays mean the exact date often isn't a trading day;
    // widen the lookback window once if a short one comes back empty.
    let row = await fetchWindow(symbol, targetDate, 10);
    if (!row) row = await fetchWindow(symbol, targetDate, 30);
    if (!row) {
      return res.status(404).json({ error: `No price data found for "${ticker}". Double-check the ticker, or enter the price manually.` });
    }
    const [rDate, , , , close] = row;
    const price = Number(close);
    if (!rDate || !Number.isFinite(price)) {
      return res.status(502).json({ error: `Got an unexpected response looking up "${ticker}". Enter the price manually.` });
    }
    return res.status(200).json({ ticker: symbol, date: rDate, price });
  } catch (err) {
    return res.status(502).json({ error: `Price lookup failed (${err.message}). Enter the price manually.` });
  }
}
