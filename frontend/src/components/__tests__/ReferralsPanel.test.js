import { render, screen } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({ apiEndpoints: { referrals: "/referrals/", referralQueues: "/referrals/queues/", referralMeta: "/referral-meta/" } }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "doctor", user_id: 5 }) }));

import { api } from "../../api/client";
import ReferralsPanel from "../referrals/ReferralsPanel";
import { CHART_TABS, COMING_SOON } from "../patients/PatientChartTabs";

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url === "/referral-meta/") return Promise.resolve({ data: { queues: [{ value: "all", label: "All" }], urgencies: [], specialties: [], doctors: [] } });
    if (url === "/referrals/queues/") return Promise.resolve({ data: { counts: { all: 0 } } });
    return Promise.resolve({ data: { count: 0, results: [] } });
  });
});

test("the Referral List chart tab is real and shows the selected patient's referrals", async () => {
  expect(CHART_TABS.some((t) => t.value === "referral_list")).toBe(true);
  expect(COMING_SOON.referral_list).toBeUndefined();
  render(<ReferralsPanel patient={{ id: 3, name: "Ann Lee" }} />);
  expect(await screen.findByText("Referrals — Ann Lee")).toBeInTheDocument();
  expect(await screen.findByTestId("referral-empty")).toBeInTheDocument();
  const call = api.get.mock.calls.find((c) => c[0] === "/referrals/");
  expect(call[1].params.patient).toBe(3);
});
