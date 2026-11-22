import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const mockNavigate = jest.fn();
let mockSearch = "";
jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: "/pharmacy-portal", search: mockSearch }),
  Navigate: ({ to }) => <div data-testid="navigate">{to}</div>,
  Link: ({ children }) => <a href="/">{children}</a>,
}), { virtual: true });
jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: { portalMe: "/portal/me/", portalRx: "/portal/rx/", portalClaim: "/portal/claim/", portalNotices: "/portal/notices/", portalStaff: "/portal/staff/" },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: jest.fn() }));

import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import PharmacyPortalPage, { ClaimDialog } from "../../pages/PharmacyPortalPage";
import PharmacyPortalClaimLinkPage from "../../pages/PharmacyPortalClaimLinkPage";
import { extractClaimCode, takePendingClaim } from "../../utils/claimCode";

const ME = (role) => ({ user: { role }, pharmacy: { name: "Botika ni Aling Nena (DEMO)", fda_lto_number: "DEMO-LTO-1", lto_expiry: "2027-11-21" }, problem: "", unread_notices: 0 });
const signIn = (role) => {
  if (role) {
    localStorage.setItem("access_token", "t");
    jwtDecode.mockReturnValue({ role, exp: Date.now() / 1000 + 3600 });
  } else {
    localStorage.removeItem("access_token");
  }
};

beforeEach(() => {
  mockSearch = "";
  mockNavigate.mockReset();
  api.get.mockReset();
  api.post.mockReset();
  sessionStorage.clear();
});

test("the claim code is read from the new link, the old POWER-RX text, or typed", () => {
  expect(extractClaimCode("https://www.powerhealthit.com/pharmacy-portal/claim?code=k7pq2m9x")).toBe("K7PQ2M9X");
  expect(extractClaimCode("POWER-RX:K7PQ2M9X")).toBe("K7PQ2M9X");
  expect(extractClaimCode(" k7pq-2m9x ")).toBe("K7PQ2M9X");
  expect(extractClaimCode("")).toBe("");
  expect(extractClaimCode("https://www.powerhealthit.com/pharmacy-portal/claim")).toBe("");
});

describe("the QR link page (/pharmacy-portal/claim?code=...)", () => {
  test("not signed in: keeps the code and goes to sign-in", () => {
    signIn(null);
    mockSearch = "?code=K7PQ2M9X";
    render(<PharmacyPortalClaimLinkPage />);
    expect(screen.getByTestId("navigate")).toHaveTextContent("/login");
    expect(takePendingClaim()).toBe("K7PQ2M9X");
  });

  test("a portal login goes straight to the portal's Claim box with the code", () => {
    signIn("ext_pharmacist");
    mockSearch = "?code=K7PQ2M9X";
    render(<PharmacyPortalClaimLinkPage />);
    expect(screen.getByTestId("navigate")).toHaveTextContent("/pharmacy-portal?claim=K7PQ2M9X");
  });

  test("anyone else gets a clear message", () => {
    signIn("doctor");
    mockSearch = "?code=K7PQ2M9X";
    render(<PharmacyPortalClaimLinkPage />);
    expect(screen.getByTestId("claim-link-not-portal")).toHaveTextContent("for pharmacies on the POWER Pharmacy Portal");
  });
});

describe("the portal opens Claim from a QR link", () => {
  const portalApi = (role) => api.get.mockImplementation((url) => Promise.resolve({ data: url === "/portal/me/" ? ME(role) : { results: [], counts: {} } }));

  test("from ?claim= the Claim box opens with the code filled in; birthdate and mobile still needed", async () => {
    signIn("ext_pharmacist");
    portalApi("ext_pharmacist");
    mockSearch = "?claim=K7PQ2M9X";
    render(<PharmacyPortalPage />);
    expect(await screen.findByTestId("claim-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("claim-code")).toHaveValue("K7PQ2M9X");
    expect(screen.getByTestId("claim-submit")).toBeDisabled();
  });

  test("after signing in, the code kept from the link is used once", async () => {
    signIn("ext_pharmacist");
    portalApi("ext_pharmacist");
    sessionStorage.setItem("power.portal.pendingClaim", "K7PQ2M9X");
    render(<PharmacyPortalPage />);
    expect(await screen.findByTestId("claim-code")).toHaveValue("K7PQ2M9X");
    expect(sessionStorage.getItem("power.portal.pendingClaim")).toBeNull();
  });

  test("a pharmacy administrator (not a pharmacist) is told to ask a pharmacist", async () => {
    signIn("ext_pharmacy_admin");
    portalApi("ext_pharmacy_admin");
    mockSearch = "?claim=K7PQ2M9X";
    render(<PharmacyPortalPage />);
    expect(await screen.findByTestId("portal-claim-not-pharmacist")).toHaveTextContent("only a pharmacist can claim");
    expect(screen.queryByTestId("claim-dialog")).toBeNull();
  });
});

describe("Scan with camera", () => {
  const original = { secure: window.isSecureContext, detector: window.BarcodeDetector, media: navigator.mediaDevices };
  afterEach(() => {
    Object.defineProperty(window, "isSecureContext", { value: original.secure, configurable: true });
    if (original.detector) window.BarcodeDetector = original.detector;
    else delete window.BarcodeDetector;
    Object.defineProperty(navigator, "mediaDevices", { value: original.media, configurable: true });
  });
  const camera = (getUserMedia) => {
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
  };

  test("a scanned QR (new link or old text) fills the claim code", async () => {
    const track = { stop: jest.fn() };
    camera(jest.fn().mockResolvedValue({ getTracks: () => [track] }));
    window.BarcodeDetector = jest.fn().mockImplementation(() => ({
      detect: jest.fn().mockResolvedValue([{ rawValue: "https://www.powerhealthit.com/pharmacy-portal/claim?code=k7pq2m9x" }]),
    }));
    render(<ClaimDialog open onClose={() => {}} onClaimed={() => {}} />);
    fireEvent.click(screen.getByTestId("claim-scan"));
    await waitFor(() => expect(screen.getByTestId("claim-code")).toHaveValue("K7PQ2M9X"));
    expect(track.stop).toHaveBeenCalled(); // the camera is switched off after a read
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" } });
  });

  test("a browser that can't read QR codes says so (type the code instead)", async () => {
    camera(jest.fn());
    delete window.BarcodeDetector;
    render(<ClaimDialog open onClose={() => {}} onClaimed={() => {}} />);
    fireEvent.click(screen.getByTestId("claim-scan"));
    expect(await screen.findByTestId("claim-scan-message")).toHaveTextContent("can't read QR codes");
  });

  test("camera permission denied is explained", async () => {
    camera(jest.fn().mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" })));
    window.BarcodeDetector = jest.fn();
    render(<ClaimDialog open onClose={() => {}} onClaimed={() => {}} />);
    fireEvent.click(screen.getByTestId("claim-scan"));
    expect(await screen.findByTestId("claim-scan-message")).toHaveTextContent("Camera permission was denied");
  });
});
