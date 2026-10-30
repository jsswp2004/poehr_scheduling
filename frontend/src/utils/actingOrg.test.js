import { clearActingOrg, followsActingOrg, getActingOrg, isNeutralPath, setActingOrg } from "./actingOrg";

describe("actingOrg", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearActingOrg();
  });

  test("starts on the administrator's own organization", () => {
    expect(getActingOrg()).toBeNull();
  });

  test("choosing another organization is remembered for this tab", () => {
    setActingOrg({ id: 7, name: "Lakeview" }, { id: 1, name: "Home" });
    expect(getActingOrg()).toMatchObject({ id: "7", name: "Lakeview", ownId: "1", ownName: "Home" });
    expect(JSON.parse(window.sessionStorage.getItem("power.actingOrg")).id).toBe("7");
  });

  test("choosing the own organization goes back to normal", () => {
    setActingOrg({ id: 7, name: "Lakeview" }, { id: 1, name: "Home" });
    setActingOrg({ id: 1, name: "Home" }, { id: 1, name: "Home" });
    expect(getActingOrg()).toBeNull();
    expect(window.sessionStorage.getItem("power.actingOrg")).toBeNull();
  });

  test("clearing forgets the choice", () => {
    setActingOrg({ id: 7, name: "Lakeview" }, { id: 1, name: "Home" });
    clearActingOrg();
    expect(getActingOrg()).toBeNull();
  });

  test("only the converted pages follow the choice", () => {
    expect(followsActingOrg("/staffing")).toBe(true);
    expect(followsActingOrg("/organization-access")).toBe(true);
    expect(followsActingOrg("/environment")).toBe(true);
    expect(followsActingOrg("/patients")).toBe(false);
    expect(isNeutralPath("/solutions")).toBe(true);
    expect(isNeutralPath("/patients")).toBe(false);
  });
});
