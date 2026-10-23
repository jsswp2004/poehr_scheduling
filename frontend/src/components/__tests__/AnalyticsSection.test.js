import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";

jest.mock("../../config/api", () => ({ API_BASE_URL: "http://api.test" }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "tok" }), { virtual: true });
jest.mock("../../hooks/useSubscriptionAccess", () => ({ useSubscriptionAccess: jest.fn() }), { virtual: true });
// The date pickers are covered by MUI; a plain input keeps these tests about our page.
jest.mock("@mui/x-date-pickers", () => ({
  LocalizationProvider: ({ children }) => <div>{children}</div>,
  DatePicker: ({ label }) => <input aria-label={label} />,
}));
jest.mock("@mui/x-date-pickers/AdapterDateFns", () => ({ AdapterDateFns: function () {} }));

import { useSubscriptionAccess } from "../../hooks/useSubscriptionAccess";
import AnalyticsSection, { groupReports, QUICK_RANGES, activeQuickRange } from "../patients/AnalyticsSection";

const STANDARD = ["Upcoming Appointments Report", "Provider Schedule Report", "New Patient Registrations", "Mystery Report"];
const ADVANCED = ["No-Show & Cancellation Rate", "Appointment Volume Trends"];

const setup = (props = {}) => {
  const p = {
    analyticsTab: "standard", setAnalyticsTab: jest.fn(),
    reportStartDate: new Date(2026, 9, 1, 12), setReportStartDate: jest.fn(),
    reportEndDate: new Date(2026, 9, 31, 12), setReportEndDate: jest.fn(),
    reportProvider: "all", setReportProvider: jest.fn(),
    providers: [{ id: 3, first_name: "Jeffrey", last_name: "Lee" }],
    analyticsReports: STANDARD, advancedAnalyticsReports: ADVANCED,
    onDownloadReport: jest.fn(), ...props,
  };
  render(<AnalyticsSection {...p} />);
  return p;
};

const okFetch = (data) => jest.fn().mockResolvedValue({ ok: true, json: async () => ({ data }) });

beforeEach(() => {
  jest.clearAllMocks();
  useSubscriptionAccess.mockReturnValue({ permissions: { advancedAnalytics: true }, tier: "clinic" });
  global.fetch = okFetch([{ patient: "Garcia, Maria", appointment_date: "2026-10-23", status: "scheduled" }]);
  jest.spyOn(console, "log").mockImplementation(() => {});
});

test("groupReports groups known reports and keeps unknown ones under Other", () => {
  const g = groupReports("standard", STANDARD);
  expect(g.map((x) => x.label)).toEqual(["Appointments", "Schedule", "Patients", "Other"]);
  expect(g[3].items).toEqual(["Mystery Report"]);
});

test("quick ranges: this month and last month, and the active one is detected", () => {
  const now = new Date(2026, 9, 22);
  const month = QUICK_RANGES.find((q) => q.key === "month").range(now);
  expect([month[0].getDate(), month[1].getDate()]).toEqual([1, 31]);
  const last = QUICK_RANGES.find((q) => q.key === "last").range(now);
  expect([last[0].getMonth(), last[1].getDate()]).toEqual([8, 30]);
  expect(activeQuickRange(month[0], month[1], now)).toBe("month");
  expect(activeQuickRange(new Date(2026, 0, 1), new Date(2026, 0, 5), now)).toBeNull();
});

test("shows the two tabs and the grouped list", () => {
  setup();
  expect(screen.getByRole("tab", { name: "Standard Reports" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Advanced Analytics" })).toBeInTheDocument();
  expect(screen.getByText("Appointments")).toBeInTheDocument();
  expect(screen.getByTestId("preview-idle")).toHaveTextContent("Pick a report");
});

test("clicking a report runs it with the dates and provider", async () => {
  setup({ reportProvider: 3 });
  fireEvent.click(screen.getByText("Upcoming Appointments Report"));
  expect(await screen.findByTestId("preview-report")).toBeInTheDocument();
  const url = global.fetch.mock.calls[0][0];
  expect(url).toContain("report_type=Upcoming+Appointments+Report");
  expect(url).toContain("start_date=2026-10-01");
  expect(url).toContain("end_date=2026-10-31");
  expect(url).toContain("provider_id=3");
  expect(screen.getByText("Garcia, Maria")).toBeInTheDocument();
  expect(screen.getByText("Records").nextSibling).toHaveTextContent("1");
});

test("Download in the preview header downloads the open report", async () => {
  const p = setup();
  fireEvent.click(screen.getByText("Upcoming Appointments Report"));
  fireEvent.click(await screen.findByRole("button", { name: /Download/ }));
  expect(p.onDownloadReport).toHaveBeenCalledWith("Upcoming Appointments Report");
});

test("the row menu offers Download, Print and Delete", async () => {
  const p = setup();
  fireEvent.click(screen.getByRole("button", { name: "More actions for Provider Schedule Report" }));
  expect(await screen.findByRole("menuitem", { name: "Print" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Download" }));
  expect(p.onDownloadReport).toHaveBeenCalledWith("Provider Schedule Report");
});

test("quick range chips set both dates", () => {
  const p = setup();
  fireEvent.click(screen.getByTestId("quick-7d"));
  expect(p.setReportStartDate).toHaveBeenCalledTimes(1);
  expect(p.setReportEndDate).toHaveBeenCalledTimes(1);
  const [s, e] = [p.setReportStartDate.mock.calls[0][0], p.setReportEndDate.mock.calls[0][0]];
  expect(Math.round((e - s) / 86400000)).toBe(6);
});

test("a failed run says so and Try again runs it once more", async () => {
  global.fetch = jest.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValue({ ok: true, json: async () => ({ data: [] }) });
  setup();
  fireEvent.click(screen.getByText("Upcoming Appointments Report"));
  expect(await screen.findByTestId("preview-error")).toHaveTextContent("Could not run this report");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
});

test("no records: says so and offers all providers when one is chosen", async () => {
  global.fetch = okFetch([]);
  const p = setup({ reportProvider: 3 });
  fireEvent.click(screen.getByText("Upcoming Appointments Report"));
  const empty = await screen.findByTestId("preview-empty-data");
  expect(empty).toHaveTextContent("No records found");
  fireEvent.click(within(empty).getByRole("button", { name: "Show all providers" }));
  expect(p.setReportProvider).toHaveBeenCalledWith("all");
});

test("without Advanced Analytics the tab stays and opens the upgrade card", () => {
  useSubscriptionAccess.mockReturnValue({ permissions: { advancedAnalytics: false }, tier: "basic" });
  const p = setup();
  fireEvent.click(screen.getByRole("tab", { name: "Advanced Analytics" }));
  expect(p.setAnalyticsTab).toHaveBeenCalledWith("advanced");
});

test("on the advanced tab a plan without access sees the upgrade card, not reports", () => {
  useSubscriptionAccess.mockReturnValue({ permissions: { advancedAnalytics: false }, tier: "basic" });
  setup({ analyticsTab: "advanced" });
  expect(screen.queryByText("No-Show & Cancellation Rate")).toBeNull();
  expect(screen.getByTestId("advanced-upgrade")).toHaveTextContent("Your plan: Professional");
  expect(screen.getByRole("button", { name: "Upgrade to Clinic Plan" })).toBeInTheDocument();
});

test("advanced tab lists the advanced reports in their groups", () => {
  setup({ analyticsTab: "advanced" });
  expect(screen.getByText("Attendance")).toBeInTheDocument();
  expect(screen.getByText("No-Show & Cancellation Rate")).toBeInTheDocument();
  expect(screen.queryByText("Upcoming Appointments Report")).toBeNull();
});

test("switching tabs clears the open report", async () => {
  const p = setup();
  fireEvent.click(screen.getByText("Upcoming Appointments Report"));
  await screen.findByTestId("preview-report");
  fireEvent.click(screen.getByRole("tab", { name: "Advanced Analytics" }));
  expect(p.setAnalyticsTab).toHaveBeenCalledWith("advanced");
  expect(screen.getByTestId("preview-idle")).toBeInTheDocument();
});
