import axios from "axios";
import { chooseActingOrg, clearActingOrg, getActingOrg, getActingStatus, loadActingOrg } from "./actingOrg";

jest.mock("axios");
jest.mock("./tokenManager", () => ({ getAccessToken: () => "token" }));
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ organization_id: 1 }) }));

const reply = (organization) => ({ data: { organization, own: { id: 1, name: "Home" } } });

describe("actingOrg", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    clearActingOrg();
  });

  test("starts unknown, with no organization chosen", () => {
    expect(getActingStatus()).toBe("unknown");
    expect(getActingOrg()).toBeNull();
  });

  test("the server saying nothing is chosen means the sign-in window must ask", async () => {
    axios.get.mockResolvedValue(reply(null));
    await loadActingOrg();
    expect(getActingStatus()).toBe("none");
    expect(getActingOrg()).toBeNull();
  });

  test("a saved choice is mirrored, including the administrator's own organization", async () => {
    axios.get.mockResolvedValue(reply({ id: 7, name: "Lakeview" }));
    await loadActingOrg();
    expect(getActingStatus()).toBe("chosen");
    expect(getActingOrg()).toMatchObject({ id: "7", name: "Lakeview", ownId: "1", ownName: "Home" });
  });

  test("choosing sends the organization and where the choice was made", async () => {
    axios.put.mockResolvedValue(reply({ id: 7, name: "Lakeview" }));
    await chooseActingOrg({ id: "7", name: "Lakeview" }, "login");
    expect(axios.put.mock.calls[0][1]).toEqual({ organization: "7", source: "login" });
    expect(getActingOrg().id).toBe("7");
  });

  test("a choice the server refuses is not kept", async () => {
    axios.put.mockRejectedValue(new Error("nope"));
    await expect(chooseActingOrg({ id: "7", name: "Lakeview" })).rejects.toThrow();
    expect(getActingOrg()).toBeNull();
  });

  test("signing in or out forgets the choice on screen", async () => {
    axios.get.mockResolvedValue(reply({ id: 7, name: "Lakeview" }));
    await loadActingOrg();
    clearActingOrg();
    expect(getActingStatus()).toBe("unknown");
    expect(getActingOrg()).toBeNull();
  });
});
