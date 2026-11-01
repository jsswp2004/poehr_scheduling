import { findSettings, SETTINGS } from "../settingsIndex";

describe("findSettings", () => {
  it("finds a settings tab by its name and links to that tab", () => {
    const [first] = findSettings("tab man", "admin");
    expect(first.label).toBe("Tab Management");
    expect(first.path).toBe("/settings?tab=tab-management");
    expect(first.where).toBe("Settings › Tab Management");
  });

  it("finds a setting by a word people use for it", () => {
    expect(findSettings("banner", "admin").map((r) => r.label)).toContain("Patient Header");
    expect(findSettings("medication pass", "admin").map((r) => r.label)).toContain("Tasks");
  });

  it("lists settings before tools and includes the portal tools", () => {
    const rows = findSettings("order", "admin");
    expect(rows.map((r) => r.label)).toContain("Order Builder");
    const groups = rows.map((r) => r.group);
    expect(groups.indexOf("tool")).toBeGreaterThanOrEqual(groups.lastIndexOf("setting"));
  });

  it("offers nothing to staff who are not administrators, or for one letter", () => {
    expect(findSettings("tab", "nurse")).toEqual([]);
    expect(findSettings("tab", "registrar")).toEqual([]);
    expect(findSettings("t", "admin")).toEqual([]);
  });

  it("keeps Settings tabs out of the Tools group, and gives every tab a path", () => {
    expect(findSettings("settings", "admin").filter((r) => r.group === "tool").map((r) => r.label)).not.toContain("Settings");
    SETTINGS.forEach((s) => expect(s.path).toMatch(/^\/settings\?tab=/));
  });

  it("only offers system dictionaries to a system administrator", () => {
    expect(findSettings("dictionaries", "admin").map((r) => r.label)).not.toContain("System Dictionaries");
    expect(findSettings("dictionaries", "system_admin").map((r) => r.label)).toContain("System Dictionaries");
  });
});
