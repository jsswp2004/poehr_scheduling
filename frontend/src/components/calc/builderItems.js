import { OPTION_TYPES, SOURCE_TYPES, toNumber } from "../../utils/calculations";

/**
 * Shared by the Flowsheet Builder and the Note Builder: the items above a
 * calculated item that it can be calculated from.
 *
 * `items` is the editor's ordered item list ({ key, label, field_type,
 * dictionary }), `index` the position of the calculated item, and
 * `dictionaries` the admin dictionary list (each with `items`). A dropdown or
 * radio can only feed a calculation when every option's stored value is a
 * number, because an answer scores as the stored value of the option chosen.
 */
export function calcCandidates(items, index, dictionaries) {
    const out = [];
    for (let i = 0; i < index; i += 1) {
        const item = items[i];
        const key = (item.key || "").trim();
        if (!key || !SOURCE_TYPES.includes(item.field_type)) continue;
        let usable = true;
        let reason = "";
        if (OPTION_TYPES.includes(item.field_type)) {
            const dictionary = dictionaries.find((d) => d.id === item.dictionary);
            if (!dictionary) {
                usable = false;
                reason = "pick its dictionary first";
            } else if (dictionary.items.length === 0 || !dictionary.items.every((o) => toNumber(o.value) !== null)) {
                usable = false;
                reason = `its options aren't all numbers (set each option's stored value to its score, e.g. 0, 1, 2, 3)`;
            }
        }
        out.push({ key, label: item.label, field_type: item.field_type, usable, reason });
    }
    return out;
}

/**
 * The starting selection for a new calculated item that sits after
 * `itemsAbove`: every usable numeric / scored item in the same `section`
 * (or every one above when that section has none). Just a starting point.
 */
export function suggestedTotalSources(itemsAbove, section, dictionaries) {
    const candidates = calcCandidates(itemsAbove, itemsAbove.length, dictionaries).filter(
        (c) => c.usable && c.field_type !== "calculated"
    );
    const sameSection = candidates.filter((c) => {
        const item = itemsAbove.find((it) => (it.key || "").trim() === c.key);
        return item && (item.section_label || "") === (section || "");
    });
    return (sameSection.length ? sameSection : candidates).map((c) => c.key);
}

/** A key like "total_score" that no existing item already uses ("total_score_2", ...). */
export function uniqueKey(base, items) {
    const used = new Set(items.map((it) => (it.key || "").trim()));
    if (!used.has(base)) return base;
    let n = 2;
    while (used.has(`${base}_${n}`)) n += 1;
    return `${base}_${n}`;
}

/** Turns a failed API call into one readable sentence instead of raw JSON. */
export function formatApiError(error, fallback) {
    const data = error && error.response && error.response.data;
    if (!data) return fallback;
    if (typeof data === "string") return data;
    const parts = [];
    const walk = (value, label) => {
        if (typeof value === "string") {
            parts.push(label ? `${label}: ${value}` : value);
        } else if (Array.isArray(value)) {
            value.forEach((v) => walk(v, label));
        } else if (value && typeof value === "object") {
            Object.entries(value).forEach(([k, v]) => {
                const generic = k === "non_field_errors" || k === "detail" || k === "rows" || k === "fields";
                walk(v, generic ? label : label ? `${label} ${k}` : k);
            });
        }
    };
    walk(data, "");
    return parts.length ? parts.join(" ") : fallback;
}
