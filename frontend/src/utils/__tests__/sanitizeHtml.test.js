import { sanitizeHtml } from "../sanitizeHtml";

describe("sanitizeHtml", () => {
  it("keeps simple formatting", () => {
    expect(sanitizeHtml("Open <b>8-5</b><br><ul><li>one</li></ul>")).toBe("Open <b>8-5</b><br><ul><li>one</li></ul>");
  });

  it("removes scripts, handlers and images", () => {
    const out = sanitizeHtml('<p onclick="x()">Hi<script>alert(1)</script><img src=x onerror=y></p>');
    expect(out).toBe("<p>Hi</p>");
  });

  it("drops javascript links but keeps the text", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">bad</a> <a href="https://example.org">ok</a>');
    expect(out).not.toMatch(/javascript/i);
    expect(out).toContain('href="https://example.org"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("allows a text color and nothing else in style", () => {
    expect(sanitizeHtml('<span style="color:red;position:fixed">x</span>')).toBe('<span style="color:red">x</span>');
    expect(sanitizeHtml('<font color="#c62828">x</font>')).toBe('<font color="#c62828">x</font>');
  });

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null)).toBe("");
  });
});
