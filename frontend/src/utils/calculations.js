/**
 * Calculated items for the flowsheet builder and the note builder -- the
 * on-screen twin of appointments/calculations.py. Read the docstring there for
 * the `calc` config format. Both files run the same test cases
 * (appointments/calc_vectors.json), so a total shown while typing is always
 * the total the server stores on save.
 */

export const OPERATIONS = [
  { value: "sum", label: "Sum (total)" },
  { value: "average", label: "Average" },
  { value: "min", label: "Lowest" },
  { value: "max", label: "Highest" },
  { value: "formula", label: "Formula" },
];

// Field types whose answer can feed a calculation.
export const SOURCE_TYPES = ["numeric", "dropdown", "radio", "checkbox", "calculated"];
export const OPTION_TYPES = ["dropdown", "radio"];

// The interpretation of calculated item "foo" is stored beside it as
// "foo__interpretation".
export const INTERPRETATION_SUFFIX = "__interpretation";

const MAX_MAGNITUDE = 1e15;

export function toNumber(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "boolean") return raw ? 1 : 0;
  let value;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    // Number("") / Number("0x10") are lenient; accept only plain decimals,
    // the same text Python's float() accepts for ordinary answers.
    if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text)) return null;
    value = Number(text);
  } else {
    return null;
  }
  return Number.isFinite(value) ? value : null;
}

// Round away from zero on ties (1.005 -> 1.01), matching the Python twin.
export function roundHalfUp(value, decimals) {
  if (Math.abs(value) < 1e-6) return 0;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  const rounded = Math.round(Number(`${abs}e${decimals}`));
  return sign * Number(`${rounded}e-${decimals}`);
}

export function formatNumber(value, decimals) {
  let rounded = roundHalfUp(value, decimals);
  if (rounded === 0) rounded = 0; // no "-0"
  return rounded.toFixed(decimals);
}

// --- formula ---------------------------------------------------------------

const TOKEN_RE = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(.))/gy;

function tokenize(text) {
  const tokens = [];
  const source = text || "";
  TOKEN_RE.lastIndex = 0;
  while (TOKEN_RE.lastIndex < source.length) {
    const match = TOKEN_RE.exec(source);
    if (!match) break;
    const [, number, ident, other] = match;
    if (number !== undefined) {
      tokens.push(["num", parseFloat(number)]);
    } else if (ident !== undefined) {
      tokens.push(["name", ident]);
    } else if (other !== undefined && !/\s/.test(other)) {
      if (!"+-*/()".includes(other)) {
        throw new Error(
          `'${other}' is not allowed in a formula. Use numbers, item keys, + - * / and ( ).`
        );
      }
      tokens.push(["op", other]);
    }
  }
  return tokens;
}

// Returns a nested-array tree; throws Error with a readable message.
export function parseFormula(text) {
  if (!text || !text.trim()) throw new Error("Enter a formula.");
  if (text.length > 300) throw new Error("A formula can be at most 300 characters.");
  const tokens = tokenize(text);
  let index = 0;
  const peek = () => (index < tokens.length ? tokens[index] : null);
  const take = () => tokens[index++];
  const isOp = (token, chars) => token !== null && token[0] === "op" && chars.includes(token[1]);

  function parseExpr() {
    let node = parseTerm();
    while (isOp(peek(), "+-")) {
      const op = take()[1];
      node = ["bin", op, node, parseTerm()];
    }
    return node;
  }
  function parseTerm() {
    let node = parseUnary();
    while (isOp(peek(), "*/")) {
      const op = take()[1];
      node = ["bin", op, node, parseUnary()];
    }
    return node;
  }
  function parseUnary() {
    const token = peek();
    if (token !== null && token[0] === "op" && token[1] === "-") {
      take();
      return ["neg", parseUnary()];
    }
    return parsePrimary();
  }
  function parsePrimary() {
    const token = peek();
    if (token === null) throw new Error("The formula ends unexpectedly.");
    if (token[0] === "num") {
      take();
      return ["num", token[1]];
    }
    if (token[0] === "name") {
      take();
      return ["name", token[1]];
    }
    if (token[0] === "op" && token[1] === "(") {
      take();
      const node = parseExpr();
      const closing = peek();
      if (!(closing !== null && closing[0] === "op" && closing[1] === ")")) {
        throw new Error("A '(' in the formula has no matching ')'.");
      }
      take();
      return node;
    }
    throw new Error(`Unexpected '${token[1]}' in the formula.`);
  }

  const tree = parseExpr();
  if (index !== tokens.length) throw new Error(`Unexpected '${tokens[index][1]}' in the formula.`);
  return tree;
}

export function formulaNames(tree) {
  const names = [];
  const walk = (node) => {
    if (node[0] === "name") {
      if (!names.includes(node[1])) names.push(node[1]);
    } else if (node[0] === "neg") {
      walk(node[1]);
    } else if (node[0] === "bin") {
      walk(node[2]);
      walk(node[3]);
    }
  };
  walk(tree);
  return names;
}

export function evaluateFormula(tree, variables) {
  const kind = tree[0];
  if (kind === "num") return tree[1];
  if (kind === "name") {
    const v = variables[tree[1]];
    return v === undefined ? null : v;
  }
  if (kind === "neg") {
    const inner = evaluateFormula(tree[1], variables);
    return inner === null ? null : -inner;
  }
  const left = evaluateFormula(tree[2], variables);
  const right = evaluateFormula(tree[3], variables);
  if (left === null || right === null) return null;
  let result;
  switch (tree[1]) {
    case "+":
      result = left + right;
      break;
    case "-":
      result = left - right;
      break;
    case "*":
      result = left * right;
      break;
    default:
      if (right === 0) return null;
      result = left / right;
  }
  return Number.isFinite(result) ? result : null;
}

// --- computing -------------------------------------------------------------

function findBand(number, bands) {
  for (const band of bands || []) {
    const low = band.min === undefined ? null : band.min;
    const high = band.max === undefined ? null : band.max;
    if ((low === null || number >= low) && (high === null || number <= high)) return band.label;
  }
  return "";
}

function fsum(list) {
  // Neumaier compensated sum -- the same steps as _sum() in calculations.py,
  // so both sides agree to the last bit.
  let sum = 0;
  let c = 0;
  for (const x of list) {
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) c += sum - t + x;
    else c += x - t + sum;
    sum = t;
  }
  return sum + c;
}

/**
 * Work out one calculated item from `values` (item key -> stored answer).
 * Returns { value, number, interpretation, alerts }; `value` is "" while the
 * result can't be determined yet.
 */
export function computeCalc(calc, values) {
  const cfg = calc || {};
  const decimals = cfg.decimals === undefined ? 0 : cfg.decimals;
  const sources = cfg.sources || [];
  const numbers = {};
  sources.forEach((name) => {
    numbers[name] = toNumber(values[name]);
  });

  let result = null;
  if (cfg.operation === "formula") {
    let tree = null;
    try {
      tree = parseFormula(cfg.formula);
    } catch (e) {
      tree = null;
    }
    if (tree !== null && formulaNames(tree).every((n) => numbers[n] !== undefined && numbers[n] !== null)) {
      result = evaluateFormula(tree, numbers);
    }
  } else if (["sum", "average", "min", "max"].includes(cfg.operation)) {
    const answered = sources.map((n) => numbers[n]).filter((n) => n !== null);
    const complete = answered.length === sources.length;
    const requireAll = cfg.require_all === undefined ? true : cfg.require_all;
    if (answered.length > 0 && (complete || !requireAll)) {
      if (cfg.operation === "sum") result = fsum(answered);
      else if (cfg.operation === "average") result = fsum(answered) / answered.length;
      else if (cfg.operation === "min") result = Math.min(...answered);
      else result = Math.max(...answered);
    }
  }

  if (result !== null && (!Number.isFinite(result) || Math.abs(result) >= MAX_MAGNITUDE)) {
    result = null;
  }

  let value = "";
  let number = null;
  let interpretation = "";
  if (result !== null) {
    value = formatNumber(result, decimals);
    number = Number(value);
    interpretation = findBand(number, cfg.bands);
  }

  const alerts = [];
  (cfg.alerts || []).forEach((alert) => {
    const score = toNumber(values[alert.source]);
    const threshold = alert.min === undefined ? 0 : alert.min;
    if (score !== null && score >= threshold && !alerts.includes(alert.message)) {
      alerts.push(alert.message);
    }
  });

  return { value, number, interpretation, alerts };
}

/**
 * Fill in every calculated item of one note / one flowsheet column. `items`
 * is the ordered list of { key, field_type, calc }. Returns { values, results }
 * where `values` is a copy of the input with each result stored under its key
 * and its interpretation under key + INTERPRETATION_SUFFIX (both removed while
 * there is no result).
 */
export function applyCalculations(items, inputValues) {
  const values = { ...inputValues };
  const results = {};
  items.forEach((item) => {
    if (item.field_type !== "calculated") return;
    const result = computeCalc(item.calc, values);
    results[item.key] = result;
    if (result.value !== "") {
      values[item.key] = result.value;
      values[item.key + INTERPRETATION_SUFFIX] = result.interpretation;
    } else {
      delete values[item.key];
      delete values[item.key + INTERPRETATION_SUFFIX];
    }
  });
  return { values, results };
}

/** Short human description of a calc config, for the builder's summary chip. */
export function describeCalc(calc) {
  if (!calc || !calc.operation) return "not set up";
  if (calc.operation === "formula") return `formula: ${calc.formula || ""}`;
  const label = (OPERATIONS.find((o) => o.value === calc.operation) || {}).label || calc.operation;
  const n = (calc.sources || []).length;
  return `${label.toLowerCase()} of ${n} item${n === 1 ? "" : "s"}`;
}
