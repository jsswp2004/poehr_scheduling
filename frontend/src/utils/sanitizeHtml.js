// Keeps simple formatting only (bold, italic, underline, lists, links, text color) and drops everything else.
// The server cleans announcement HTML on save; this is the second line of defense wherever it is shown.

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI", "A", "FONT", "H3", "H4"]);
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT"]);
const SAFE_URL = /^(https?:|mailto:|tel:)/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]{3,20})$/i;

function colorOf(style) {
  const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style || "");
  const value = m && m[1].trim();
  return value && SAFE_COLOR.test(value) ? value : "";
}

function cleanNode(node, doc) {
  const out = doc.createDocumentFragment();
  node.childNodes.forEach((child) => {
    if (child.nodeType === 3) {
      out.appendChild(doc.createTextNode(child.nodeValue));
      return;
    }
    if (child.nodeType !== 1 || DROP_WITH_CONTENT.has(child.tagName)) return;
    const inner = cleanNode(child, doc);
    if (!ALLOWED.has(child.tagName)) {
      out.appendChild(inner); // unknown tag: keep its text, lose the tag
      return;
    }
    const el = doc.createElement(child.tagName.toLowerCase());
    if (child.tagName === "A") {
      const href = child.getAttribute("href") || "";
      if (SAFE_URL.test(href.trim())) {
        el.setAttribute("href", href.trim());
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
    } else if (child.tagName === "SPAN") {
      const color = colorOf(child.getAttribute("style"));
      if (color) el.setAttribute("style", `color:${color}`);
    } else if (child.tagName === "FONT") {
      const color = (child.getAttribute("color") || "").trim();
      if (SAFE_COLOR.test(color)) el.setAttribute("color", color);
    }
    el.appendChild(inner);
    out.appendChild(el);
  });
  return out;
}

export function sanitizeHtml(html) {
  if (!html || typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const holder = doc.createElement("div");
  holder.appendChild(cleanNode(doc.body, doc));
  return holder.innerHTML;
}

export default sanitizeHtml;
