import { render, screen, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { noteChartData: "/api/note-chart-data/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });

import { api } from "../../api/client";
import DynamicNoteForm, { formatFieldValue } from "../DynamicNoteForm";

const FIELD = {
  id: 1,
  key: "problems",
  label: "Problem list",
  field_type: "chart_data",
  section_label: "Problem List",
  tab_label: "",
  required: false,
  calc: { source: "problems" },
  options: [],
};
const TEMPLATE = { code: "t", name: "T", fields: [FIELD] };
const SNAPSHOT = {
  title: "Problem list",
  columns: [
    { key: "description", label: "Problem" },
    { key: "code", label: "ICD-10" },
  ],
  rows: [{ description: "Essential hypertension", code: "I10" }],
  empty: "No active problems on the chart.",
  hidden: false,
};

describe("Chart data field", () => {
  beforeEach(() => api.get.mockReset());

  test("reads the chart live while the note is being written", async () => {
    api.get.mockResolvedValue({ data: { ...SNAPSHOT, rows: [{ description: "Type 2 diabetes", code: "E11.65" }] } });
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={() => {}} patientId={42} />);
    expect(await screen.findByText("Type 2 diabetes")).toBeInTheDocument();
    expect(api.get.mock.calls[0][0]).toBe("/api/note-chart-data/?patient=42&source=problems");
    expect(screen.getByText("E11.65")).toBeInTheDocument();
    expect(screen.getByText("From chart")).toBeInTheDocument();
  });

  test("is never a field to fill in: no input, and it does not call onChange", async () => {
    api.get.mockResolvedValue({ data: SNAPSHOT });
    const onChange = jest.fn();
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={onChange} patientId={42} />);
    await screen.findByText("Essential hypertension");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  test("shows the snapshot the server kept when there is no patient to read", () => {
    render(<DynamicNoteForm template={TEMPLATE} values={{ problems: SNAPSHOT }} onChange={() => {}} />);
    expect(screen.getByText("Essential hypertension")).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
  });

  test("falls back to the stored snapshot when the chart can't be read", async () => {
    api.get.mockRejectedValue(new Error("boom"));
    render(<DynamicNoteForm template={TEMPLATE} values={{ problems: SNAPSHOT }} onChange={() => {}} patientId={42} />);
    expect(await screen.findByText("Essential hypertension")).toBeInTheDocument();
  });

  test("template preview (no patient, nothing stored) names the source", () => {
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={() => {}} />);
    expect(screen.getByText(/Shown from the patient's chart: Problem list/)).toBeInTheDocument();
  });

  test("says so when the chart part is empty", async () => {
    api.get.mockResolvedValue({ data: { ...SNAPSHOT, rows: [] } });
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={() => {}} patientId={42} />);
    expect(await screen.findByText("No active problems on the chart.")).toBeInTheDocument();
  });

  test("tells the user when they may not see that part of the chart", async () => {
    api.get.mockResolvedValue({ data: { title: "Laboratory results", hidden: true } });
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={() => {}} patientId={42} />);
    await waitFor(() => expect(screen.getByText(/don't have access/)).toBeInTheDocument());
  });
});

describe("formatFieldValue for chart data", () => {
  test("one line per chart row", () => {
    const two = { ...SNAPSHOT, rows: [...SNAPSHOT.rows, { description: "Hyperlipidemia", code: "E78.5" }] };
    expect(formatFieldValue(FIELD, two, {})).toBe("Essential hypertension, I10; Hyperlipidemia, E78.5");
  });
  test("empty chart gives the empty text, nothing stored gives null", () => {
    expect(formatFieldValue(FIELD, { ...SNAPSHOT, rows: [] }, {})).toBe("No active problems on the chart.");
    expect(formatFieldValue(FIELD, "", {})).toBeNull();
    expect(formatFieldValue(FIELD, { hidden: true }, {})).toBeNull();
  });
});
