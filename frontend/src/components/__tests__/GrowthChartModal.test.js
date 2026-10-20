import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { growthChartPatient: (id) => `/g/${id}/` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "nurse", user_id: 5 }) }));

import { api } from "../../api/client";
import GrowthChartButton, { GrowthChartModal, fmtMonths, isUnder20 } from "../growth/GrowthChartModal";

const point = (over = {}) => ({
  date: "2026-08-01", chrono_months: 7.0, plot_months: 7.0, x: 7.0, value: 7.9, z: 0.1, percentile: 54, percentile_label: "54th",
  status: "ok", status_label: "Within range", flag: false, weight_kg: 7.9, height_cm: 68, ...over,
});
const curve = (label, z, base) => ({ label, z, points: [[0, base], [12, base + 4], [24, base + 6]] });
const chart = (key, label, over = {}) => ({
  key, label, title: `${label}, boys, birth to 24 months`, standard: "WHO child growth standards",
  x: { label: "Age in months", unit: "months", min: 0, max: 24, ticks: [[0, "0"], [12, "12"], [24, "24"]] },
  y: { label: "Weight (kg)", unit: "kg", min: 2, max: 16, ticks: [[2, "2"], [8, "8"], [16, "16"]] },
  curves: [curve("2nd", -2, 2.5), curve("50th", 0, 3.3), curve("98th", 2, 4.4)],
  points: [point({ date: "2026-05-01", chrono_months: 4, x: 4, value: 6.4 }), point()], latest: point(), flagged: false, ...over,
});
const BODY = (over = {}) => ({
  patient: { id: 3, name: "Test, Child", date_of_birth: "2026-01-01", sex: "male", age_months: 9.8, gestational_age_weeks: null, gestational_age_days: null, birth_weight_g: null },
  as_of: "2026-10-20", problem: "", problem_text: "",
  info: { preterm: false, corrected_applied: false, correction_weeks: 0, gestational_age_known: false, chrono_months: 9.8, plot_months: 9.8, correction_days: 0 },
  charts: [chart("who_weight_for_age", "Weight-for-age"), chart("who_length_for_age", "Length-for-age", { points: [], latest: null })],
  skipped: 0, ...over,
});

beforeEach(() => api.get.mockReset());

test("helpers", () => {
  expect(isUnder20(239)).toBe(true);
  expect(isUnder20(240)).toBe(false);
  expect(isUnder20(null)).toBe(false);
  expect(fmtMonths(7)).toBe("7 mo");
  expect(fmtMonths(13.5)).toBe("13.5 mo");
  expect(fmtMonths(30)).toBe("2 y 6 mo");
  expect(fmtMonths(36)).toBe("3 y");
});

test("button only shows for patients under 20", () => {
  const { rerender } = render(<GrowthChartButton patientId={3} ageMonths={300} />);
  expect(screen.queryByTestId("growth-chart-button")).toBeNull();
  rerender(<GrowthChartButton patientId={3} ageMonths={null} />);
  expect(screen.queryByTestId("growth-chart-button")).toBeNull();
  rerender(<GrowthChartButton patientId={3} ageMonths={30} />);
  expect(screen.getByTestId("growth-chart-button")).toBeInTheDocument();
});

test("button opens the modal and loads the chart", async () => {
  api.get.mockResolvedValue({ data: BODY() });
  render(<GrowthChartButton patientId={3} ageMonths={9} />);
  fireEvent.click(screen.getByTestId("growth-chart-button"));
  await screen.findByTestId("gc-svg-who_weight_for_age");
  expect(api.get.mock.calls[0][0]).toBe("/g/3/?corrected=1");
  expect(screen.getAllByTestId("gc-point")).toHaveLength(2);
  expect(screen.getByTestId("gc-latest")).toHaveTextContent("54th percentile");
  expect(screen.getByTestId("gc-term-note")).toBeInTheDocument();
  expect(screen.queryByTestId("gc-flags")).toBeNull();
});

test("a flagged measurement is written out and drawn as a diamond", async () => {
  const flagged = point({ value: 5.0, z: -2.4, percentile_label: "1st", status: "low", status_label: "Below the 2nd percentile", flag: true });
  api.get.mockResolvedValue({ data: BODY({ charts: [chart("who_weight_for_age", "Weight-for-age", { points: [flagged], latest: flagged, flagged: true })] }) });
  render(<GrowthChartModal patientId={3} onClose={() => {}} />);
  const note = await screen.findByTestId("gc-flags");
  expect(note).toHaveTextContent("Weight-for-age: Below the 2nd percentile (1st percentile)");
  expect(note).toHaveTextContent("not diagnoses");
  expect(screen.getByTestId("gc-point-flag")).toBeInTheDocument();
});

test("tabs switch between charts and an empty chart says what to do", async () => {
  api.get.mockResolvedValue({ data: BODY() });
  render(<GrowthChartModal patientId={3} onClose={() => {}} />);
  await screen.findByTestId("gc-svg-who_weight_for_age");
  fireEvent.click(screen.getByTestId("gc-tab-who_length_for_age"));
  expect(await screen.findByTestId("gc-svg-who_length_for_age")).toBeInTheDocument();
  expect(screen.getByTestId("gc-empty")).toHaveTextContent("Vital Signs flowsheet");
});

test("preterm babies get the corrected-age switch, which reloads the chart", async () => {
  const preterm = BODY({
    patient: { ...BODY().patient, gestational_age_weeks: 32, gestational_age_days: 0, birth_weight_g: 1600 },
    info: { preterm: true, corrected_applied: true, correction_weeks: 8, gestational_age_known: true, chrono_months: 4, plot_months: 2.2, correction_days: 56 },
  });
  api.get.mockResolvedValue({ data: preterm });
  render(<GrowthChartModal patientId={3} onClose={() => {}} />);
  expect(await screen.findByTestId("gc-corrected-note")).toHaveTextContent("corrected age");
  expect(screen.queryByTestId("gc-term-note")).toBeNull();
  fireEvent.click(screen.getByTestId("gc-corrected"));
  await waitFor(() => expect(api.get.mock.calls.at(-1)[0]).toBe("/g/3/?corrected=0"));
});

test("problems are explained instead of drawing an empty chart", async () => {
  api.get.mockResolvedValue({ data: BODY({ problem: "no_sex", problem_text: "Sex is not recorded on the registration.", info: null, charts: [] }) });
  render(<GrowthChartModal patientId={3} onClose={() => {}} />);
  expect(await screen.findByTestId("gc-problem")).toHaveTextContent("Sex is not recorded");
  expect(screen.queryByTestId("gc-print")).toBeNull();
});

test("a load failure shows an error", async () => {
  api.get.mockRejectedValue({ response: { data: { detail: "Not allowed." } } });
  render(<GrowthChartModal patientId={3} onClose={() => {}} />);
  expect(await screen.findByTestId("gc-error")).toBeInTheDocument();
});
