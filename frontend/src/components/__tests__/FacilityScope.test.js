import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: jest.fn() }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }), { virtual: true });

import { api } from "../../api/client";
import { getValidToken } from "../../utils/auth";
import { jwtDecode } from "jwt-decode";
import FacilityPicker from "../facility/FacilityPicker";
import SingleFacilityOnly from "../facility/SingleFacilityOnly";
import {
  ALL, applyToFacilities, attach, chooseFacility, configureFacilityScope, getFacilityScope, isAllFacilities, resetFacilityScope,
} from "../../utils/facilityScope";

const FACILITIES = [
  { id: 2, name: "Bravo Clinic" },
  { id: 1, name: "Alpha Clinic" },
  { id: 3, name: "Charlie Clinic" },
];

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  window.sessionStorage.clear();
  resetFacilityScope();
  getValidToken.mockResolvedValue({ access_token: "t" });
});

describe("the scope", () => {
  test("nothing chosen sends no header; one facility sends its id", () => {
    configureFacilityScope(FACILITIES);
    expect(attach({}).headers).toBeUndefined();
    chooseFacility("3");
    expect(attach({}).headers["X-Facility-Id"]).toBe("3");
  });

  test("outside Settings (not configured) nothing is ever added", () => {
    expect(attach({}).headers).toBeUndefined();
    chooseFacility("1");
    expect(attach({}).headers).toBeUndefined();
  });

  test("All facilities reads from the first facility", () => {
    configureFacilityScope(FACILITIES);
    chooseFacility(ALL);
    expect(isAllFacilities()).toBe(true);
    expect(attach({}).headers["X-Facility-Id"]).toBe("2");
  });

  test("an unknown choice is ignored, a stored choice is restored", () => {
    configureFacilityScope(FACILITIES);
    chooseFacility("99");
    expect(getFacilityScope().choice).toBe("");
    chooseFacility("1");
    resetFacilityScope();
    configureFacilityScope(FACILITIES);
    expect(getFacilityScope().choice).toBe("1");
  });

  test("a stored facility that no longer exists is dropped", () => {
    window.sessionStorage.setItem("power.settings.facility", "42");
    configureFacilityScope(FACILITIES);
    expect(getFacilityScope().choice).toBe("");
  });

  test("one facility: the save just runs once", async () => {
    configureFacilityScope(FACILITIES);
    chooseFacility("1");
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(applyToFacilities(fn)).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("All facilities: the save runs for each facility, each with its own header", async () => {
    configureFacilityScope(FACILITIES);
    chooseFacility(ALL);
    const seen = [];
    const result = await applyToFacilities(async (f) => {
      seen.push([f.id, attach({}).headers["X-Facility-Id"]]);
      return `saved-${f.id}`;
    });
    expect(seen).toEqual([[2, "2"], [1, "1"], [3, "3"]]);
    expect(result).toBe("saved-2");
    expect(attach({}).headers["X-Facility-Id"]).toBe("2"); // back to reading the first facility
  });

  test("All facilities: one failure does not stop the rest and is reported by name", async () => {
    configureFacilityScope(FACILITIES);
    chooseFacility(ALL);
    const fn = jest.fn(async (f) => {
      if (f.id === 1) throw Object.assign(new Error("boom"), { response: { data: { detail: "Unknown header item: custom:x" } } });
    });
    let caught;
    try {
      await applyToFacilities(fn);
    } catch (err) {
      caught = err;
    }
    expect(fn).toHaveBeenCalledTimes(3);
    expect(caught.partial).toBe(true);
    expect(caught.message).toMatch(/Saved for 2 of 3 facilities/);
    expect(caught.message).toMatch(/Alpha Clinic/);
    expect(caught.message).toMatch(/Unknown header item/);
    expect(caught.response.data.detail).toBe(caught.message);
    expect(attach({}).headers["X-Facility-Id"]).toBe("2");
  });
});

describe("the picker", () => {
  const asRole = (role) => jwtDecode.mockReturnValue({ role });

  test("other roles just see the settings, no picker, nothing fetched", async () => {
    asRole("admin");
    render(<FacilityPicker><div>the settings</div></FacilityPicker>);
    expect(await screen.findByText("the settings")).toBeInTheDocument();
    expect(screen.queryByTestId("facility-picker")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(attach({}).headers).toBeUndefined();
  });

  test("a system administrator must choose first; the settings stay hidden until then", async () => {
    asRole("system_admin");
    api.get.mockResolvedValue({ data: FACILITIES });
    render(<FacilityPicker><div>the settings</div></FacilityPicker>);
    expect(await screen.findByTestId("choose-facility-note")).toBeInTheDocument();
    expect(screen.queryByText("the settings")).not.toBeInTheDocument();
  });

  test("choosing a facility shows the settings and sends that facility's header", async () => {
    asRole("system_admin");
    api.get.mockResolvedValue({ data: FACILITIES });
    render(<FacilityPicker><div>the settings</div></FacilityPicker>);
    await screen.findByTestId("choose-facility-note");
    act(() => chooseFacility("3"));
    expect(await screen.findByText("the settings")).toBeInTheDocument();
    expect(screen.queryByTestId("choose-facility-note")).not.toBeInTheDocument();
    expect(attach({}).headers["X-Facility-Id"]).toBe("3");
  });

  test("the facility list is alphabetical and offers All facilities", async () => {
    asRole("system_admin");
    api.get.mockResolvedValue({ data: FACILITIES });
    render(<FacilityPicker><div>x</div></FacilityPicker>);
    await screen.findByTestId("choose-facility-note");
    fireEvent.mouseDown(screen.getByRole("combobox"));
    const options = (await screen.findAllByRole("option")).map((o) => o.textContent).filter((t) => t && !t.startsWith("Change"));
    expect(options).toEqual(["Alpha Clinic", "Bravo Clinic", "Charlie Clinic", "All facilities (system-wide)"]);
  });

  test("All facilities warns that a save is copied to every facility", async () => {
    asRole("system_admin");
    api.get.mockResolvedValue({ data: FACILITIES });
    render(<FacilityPicker><div>the settings</div></FacilityPicker>);
    await screen.findByTestId("choose-facility-note");
    act(() => chooseFacility(ALL));
    const note = await screen.findByTestId("all-facilities-note");
    expect(note).toHaveTextContent("copied to all 3 facilities");
    expect(note).toHaveTextContent("Alpha Clinic");
    expect(screen.getByText("the settings")).toBeInTheDocument();
  });

  test("leaving Settings stops the header", async () => {
    asRole("system_admin");
    api.get.mockResolvedValue({ data: FACILITIES });
    const { unmount } = render(<FacilityPicker><div>x</div></FacilityPicker>);
    await screen.findByTestId("choose-facility-note");
    act(() => chooseFacility("1"));
    expect(attach({}).headers["X-Facility-Id"]).toBe("1");
    unmount();
    expect(attach({}).headers).toBeUndefined();
  });

  test("if the facility list cannot load it says so", async () => {
    asRole("system_admin");
    api.get.mockRejectedValue(new Error("down"));
    render(<FacilityPicker><div>x</div></FacilityPicker>);
    expect(await screen.findByText(/Could not load the list of facilities/)).toBeInTheDocument();
  });
});

describe("single-facility-only settings", () => {
  test("they ask for one facility when All is chosen, and show normally otherwise", () => {
    configureFacilityScope(FACILITIES);
    chooseFacility("1");
    const { rerender } = render(<SingleFacilityOnly what="An upload"><div>uploader</div></SingleFacilityOnly>);
    expect(screen.getByText("uploader")).toBeInTheDocument();
    act(() => chooseFacility(ALL));
    rerender(<SingleFacilityOnly what="An upload"><div>uploader</div></SingleFacilityOnly>);
    expect(screen.queryByText("uploader")).not.toBeInTheDocument();
    expect(screen.getByTestId("single-facility-only")).toHaveTextContent("An upload belongs to one facility at a time");
  });

  test("not shown when there is no picker (other roles)", () => {
    render(<SingleFacilityOnly what="An upload"><div>uploader</div></SingleFacilityOnly>);
    expect(screen.getByText("uploader")).toBeInTheDocument();
  });
});
