// Intake & Output helpers. Everything on the flowsheet is millilitres; a nurse may type ounces.
export const ML_PER_OZ = 30;
export const IO_TEMPLATE_CODE = "intake_output";

// "240", "240 ml", "8 oz", "8oz", "8 ounces" -> { ml, converted }, or null when it isn't an amount.
export function parseVolume(text) {
  if (text === null || text === undefined) return null;
  const match = String(text)
    .trim()
    .toLowerCase()
    .match(/^(\d+(?:\.\d+)?|\.\d+)\s*(ml|oz|ounces?)?\.?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const isOunces = !!match[2] && match[2] !== "ml";
  const ml = isOunces ? amount * ML_PER_OZ : amount;
  return { ml: Math.round(ml * 10) / 10, converted: isOunces };
}

// What a cell should hold after the nurse leaves it: "8 oz" becomes "240"; anything else is left alone.
export function convertVolumeText(text) {
  const parsed = parseVolume(text);
  return parsed && parsed.converted ? String(parsed.ml) : text;
}

export function formatMl(value, { signed = false } = {}) {
  if (value === null || value === undefined) return "--";
  const text = Math.abs(value).toLocaleString();
  if (signed && value > 0) return `+${text}`;
  return value < 0 ? `-${text}` : text;
}
