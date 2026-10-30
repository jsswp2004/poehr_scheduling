// Pricing rules for services. Mirrors users/modules.py on the server; the server is the source of truth for
// what is actually billed, this only drives the running total on screen.
export const BASE_PRICE = 299;
export const EXTRA_MODULE_PRICE = 150;

/** Modules that carry a price (everything except those quoted separately), in the order they were ticked. */
export const pricedModules = (selected, modules) => {
  const quoted = new Set((modules || []).filter((m) => m.quoted).map((m) => m.code));
  return (selected || []).filter((code) => !quoted.has(code));
};

// `included` is how many priced services the plan's base price covers (Professional 1, Clinic 2).
export const monthlyTotal = (selected, modules, base = BASE_PRICE, extra = EXTRA_MODULE_PRICE, included = 1) => {
  const n = pricedModules(selected, modules).length;
  return base + extra * Math.max(0, n - included);
};

// Fallback used until the server's per-plan terms arrive (/api/users/modules/ -> pricing.plans).
const DEFAULT_PLAN_TERMS = {
  basic: { base: 299, included_count: 1, quoted: false },
  premium: { base: 599, included_count: 2, quoted: false },
  enterprise: { base: 599, included_count: 2, quoted: true },
};

/** {base, included, quoted} for a plan key, from the server's per-plan terms when we have them. */
export const planTerms = (planPricing, key) => {
  const t = (planPricing && planPricing[key]) || DEFAULT_PLAN_TERMS[key] || DEFAULT_PLAN_TERMS.basic;
  return { base: t.base, included: t.included_count, quoted: !!t.quoted };
};

/** Monthly total for a plan, or null when the plan is priced by a quote. */
export const planMonthlyTotal = (selected, modules, planPricing, key) => {
  const t = planTerms(planPricing, key);
  return t.quoted ? null : monthlyTotal(selected, modules, t.base, EXTRA_MODULE_PRICE, t.included);
};

export const formatMoney = (n) => `$${Number(n).toLocaleString('en-US')}`;

export const userLimitLabel = (limit) => (limit >= 999999 ? 'Unlimited users' : limit === 1 ? '1 user' : `Up to ${limit} users`);

export const GROUP_ORDER = ['Clinical', 'Operations', 'Add-ons'];
