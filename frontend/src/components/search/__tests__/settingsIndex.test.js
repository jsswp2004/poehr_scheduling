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

  it("includes the portal tools, and puts the group with the best match first", () => {
    const rows = findSettings("order", "admin");
    expect(rows[0].label).toBe("Order Builder");
    expect(rows[0].group).toBe("tool");
  });

  it("finds Staffing pages and each standard report for anyone who can use Staffing", () => {
    expect(findSettings("labor", "admin").map((r) => r.path)).toContain("/staffing?tab=reports&report=labor_hours");
    expect(findSettings("time off", "nurse").map((r) => r.path)).toContain("/staffing?tab=timeoff");
  });

  it("keeps administrator-only Staffing tabs and all settings away from other staff", () => {
    expect(findSettings("assign", "nurse").map((r) => r.label)).not.toContain("Assign Schedule");
    expect(findSettings("assign", "admin").map((r) => r.label)).toContain("Assign Schedule");
    expect(findSettings("tab management", "nurse")).toEqual([]);
  });

  it("offers the module pages the header icons offer", () => {
    expect(findSettings("lab results", "doctor").map((r) => r.path)).toContain("/lab-inbox");
    expect(findSettings("lab results", "registrar").map((r) => r.path)).not.toContain("/lab-inbox");
  });

  it("offers no settings to staff who are not administrators, nothing to patients, and nothing for one letter", () => {
    expect(findSettings("tab management", "nurse")).toEqual([]);
    expect(findSettings("t", "admin")).toEqual([]);
    expect(findSettings("tab", "patient")).toEqual([]);
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
