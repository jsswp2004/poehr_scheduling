// Pricing rules for services. Mirrors users/modules.py on the server; the server is the source of truth for
// what is actually billed, this only drives the running total on screen.
export const BASE_PRICE = 299;
export const EXTRA_MODULE_PRICE = 150;

/** Modules that carry a price (everything except those quoted separately), in the order they were ticked. */
export const pricedModules = (selected, modules) => {
  const quoted = new Set((modules || []).filter((m) => m.quoted).map((m) => m.code));
  return (selected || []).filter((code) => !quoted.has(code));
};

export const monthlyTotal = (selected, modules, base = BASE_PRICE, extra = EXTRA_MODULE_PRICE) => {
  const n = pricedModules(selected, modules).length;
  return base + extra * Math.max(0, n - 1);
};

export const formatMoney = (n) => `$${Number(n).toLocaleString('en-US')}`;

export const userLimitLabel = (limit) => (limit >= 999999 ? 'Unlimited users' : limit === 1 ? '1 user' : `Up to ${limit} users`);

export const GROUP_ORDER = ['Clinical', 'Operations', 'Add-ons'];
