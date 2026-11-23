import { useSyncExternalStore } from "react";

// Shows US-dollar prices in Philippine pesos for visitors in the Philippines. Prices are still set in
// USD; the peso amount is an approximation from a recent exchange rate, refreshed at most every 12 hours.
// A visitor can switch back to dollars (or to pesos) and the choice is remembered in this browser.

export const FALLBACK_PHP_PER_USD = 58; // used until a live rate loads, or if it cannot be loaded
const PREF_KEY = "pp_currency";
const RATE_KEY = "pp_usd_php";
const RATE_TTL_MS = 12 * 60 * 60 * 1000;
const RATE_URL = "https://open.er-api.com/v6/latest/USD";

const read = (k) => { try { return window.localStorage.getItem(k); } catch (e) { return null; } };
const write = (k, v) => { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } };

// Philippines by the browser's time zone, or an "-PH" language such as en-PH or fil-PH.
export function detectPhilippines() {
  try {
    if (Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Manila") return true;
  } catch (e) { /* ignore */ }
  try {
    return (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).some((l) => /-PH$/i.test(l || ""));
  } catch (e) { return false; }
}

function cachedRate() {
  try {
    const c = JSON.parse(read(RATE_KEY) || "null");
    if (c && c.rate > 0) return c;
  } catch (e) { /* ignore */ }
  return null;
}

const inPH = typeof window !== "undefined" && detectPhilippines();
const pref = typeof window !== "undefined" ? read(PREF_KEY) : null;
const cached = typeof window !== "undefined" ? cachedRate() : null;
let state = {
  inPhilippines: inPH,
  currency: pref === "USD" || pref === "PHP" ? pref : inPH ? "PHP" : "USD",
  rate: cached ? cached.rate : FALLBACK_PHP_PER_USD,
};
const listeners = new Set();
const setState = (patch) => { state = { ...state, ...patch }; listeners.forEach((l) => l()); };

if (typeof window !== "undefined" && (state.currency === "PHP" || inPH) && (!cached || Date.now() - cached.at > RATE_TTL_MS)) {
  fetch(RATE_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("rate"))))
    .then((d) => {
      const rate = Number(d && d.rates && d.rates.PHP);
      if (rate > 0) { write(RATE_KEY, JSON.stringify({ rate, at: Date.now() })); setState({ rate }); }
    })
    .catch(() => { /* keep the cached or fallback rate */ });
}

export function formatPrice(s, usd, decimals = 0) {
  const n = Number(usd);
  if (s.currency === "PHP") {
    const v = n * s.rate;
    return `₱${(decimals ? v : Math.round(v)).toLocaleString("en-PH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
  return decimals ? `$${n.toFixed(decimals)}` : `$${n.toLocaleString("en-US")}`;
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getState = () => state;

export function setCurrency(currency) {
  write(PREF_KEY, currency);
  setState({ currency });
}

export function useCurrency() {
  const s = useSyncExternalStore(subscribe, getState, getState);
  return { ...s, setCurrency, money: (usd, decimals = 0) => formatPrice(s, usd, decimals) };
}
