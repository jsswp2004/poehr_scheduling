import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mockApi = { get: jest.fn(), post: jest.fn() };
jest.mock("../api/client", () => ({ api: mockApi }), { virtual: true });
jest.mock("../components/patientHeader/headerApi", () => ({
  authHeader: async () => ({ Authorization: "Bearer t" }),
  errorText: (err, fallback) => fallback,
}));
jest.mock("../components/SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

let mockOnText = null;
jest.mock("../components/dictation/useDictation", () => ({
  __esModule: true,
  default: (opts) => {
    mockOnText = opts && opts.onText;
    return { supported: true, status: "idle", partial: "", error: "", level: 0, toggle: jest.fn(), start: jest.fn(), stop: jest.fn() };
  },
}));

const DictatePage = require("./DictatePage").default;
const { buildOptions } = require("../components/dictation/NoteTypeSearch");
const { toPatient, formatDob } = require("../components/dictation/PatientSearch");
const { act } = require("@testing-library/react");

const ON = { enabled: true, cleanup: true, specialty: "PRIMARYCARE" };
const PATIENTS = {
  results: [
    { id: 7, user_id: 70, first_name: "Test", last_name: "Rivera", mrn: "MRN-100234", date_of_birth: "1961-03-14" },
    { id: 8, user_id: 80, first_name: "Sample", last_name: "Riveras", mrn: "MRN-101422", date_of_birth: "1990-07-30" },
  ],
};
const VISITS = [
  { id: 501, title: "Follow-up", appointment_datetime: "2026-10-14T14:00:00Z", status: "scheduled" },
  { id: 400, title: "Annual exam", appointment_datetime: "2026-06-05T14:00:00Z", status: "completed" },
];
const TEMPLATES = [{ code: "admission_note", name: "Admission Note", fields: [{ key: "cc" }, { key: "hx" }] }];
const ADMISSION = {
  id: 9,
  code: "admission_note",
  name: "Admission Note",
  version: 3,
  fields: [{ id: 1, key: "cc", label: "Chief complaint", field_type: "text", options: [], section_label: "History", sort_order: 1 }],
};

function route({ config = ON, visits = VISITS, patients = PATIENTS } = {}) {
  mockApi.get.mockImplementation(async (url) => {
    if (url.includes("/api/dictation/config/")) return { data: config };
    if (url.includes("/api/users/patients/")) return { data: patients };
    if (url.includes("/api/appointments/")) return { data: visits };
    if (url.includes("/api/note-templates/admission_note/")) return { data: ADMISSION };
    if (url.includes("/api/note-templates/")) return { data: TEMPLATES };
    return { data: {} };
  });
}

const chooseOption = async (label, search, optionName) => {
  const box = await screen.findByLabelText(label);
  box.focus(); // a real click focuses the box; MUI resets the text of an unfocused one
  fireEvent.mouseDown(box);
  fireEvent.change(box, { target: { value: search } });
  fireEvent.click(await screen.findByRole("option", { name: new RegExp(optionName) }));
};

beforeEach(() => {
  jest.clearAllMocks();
  try {
    localStorage.clear();
  } catch (e) {
    // ignore
  }
});

describe("stand-alone dictation", () => {
  test("says so when dictation is off for the organization", async () => {
    route({ config: { enabled: false, cleanup: false, specialty: null } });
    render(<DictatePage />);
    expect(await screen.findByText(/not turned on for your account/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Dictation")).toBeNull();
  });

  test("dictated words appear, and Clean up offers a version to accept", async () => {
    route();
    mockApi.post.mockResolvedValue({ data: { cleaned: "Three days of cough.", fields: {}, uncertain: ["mucinex"], unplaced: [] } });
    render(<DictatePage />);
    const box = await screen.findByLabelText("Dictation");
    act(() => mockOnText("three days of cough"));
    expect(box).toHaveValue("three days of cough");

    fireEvent.click(screen.getByRole("button", { name: "Clean up" }));
    expect(await screen.findByText("Three days of cough.")).toBeInTheDocument();
    expect(mockApi.post).toHaveBeenCalledWith(expect.stringContaining("/api/dictation/cleanup/"), { transcript: "three days of cough" }, expect.anything());
    expect(box).toHaveValue("three days of cough"); // nothing replaced yet

    fireEvent.click(screen.getByRole("button", { name: "Use cleaned text" }));
    expect(box).toHaveValue("Three days of cough.");
  });

  test("a failed cleanup keeps the dictation", async () => {
    route();
    mockApi.post.mockRejectedValue({ response: { status: 503 } });
    render(<DictatePage />);
    const box = await screen.findByLabelText("Dictation");
    act(() => mockOnText("words"));
    fireEvent.click(screen.getByRole("button", { name: "Clean up" }));
    expect(await screen.findByText(/AI cleanup is not available right now/)).toBeInTheDocument();
    expect(box).toHaveValue("words");
  });

  test("Clean up is hidden when AI cleanup is off, and the buttons wait for text", async () => {
    route({ config: { enabled: true, cleanup: false, specialty: "PRIMARYCARE" } });
    render(<DictatePage />);
    await screen.findByLabelText("Dictation");
    expect(screen.queryByRole("button", { name: "Clean up" })).toBeNull();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download .txt" })).toBeDisabled();
  });
});

describe("patient and note type", () => {
  test("searching finds patients by what was typed, and the chosen patient's visits load", async () => {
    route();
    render(<DictatePage />);
    await chooseOption("Patient (optional)", "riv", "Rivera, Test");
    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/patients/"),
      expect.objectContaining({ params: { search: "riv", page_size: 8 } })
    );
    expect(await screen.findByLabelText("Visit for this note")).toBeInTheDocument();
    expect(mockApi.get).toHaveBeenCalledWith(
      expect.stringContaining("/api/appointments/"),
      expect.objectContaining({ params: { patient: 70, limit: 10 } })
    );
  });

  test("a patient with no visits cannot get a draft, but can still copy", async () => {
    route({ visits: [] });
    render(<DictatePage />);
    await chooseOption("Patient (optional)", "riv", "Rivera, Test");
    expect(await screen.findByText(/no visits to attach a note to/i)).toBeInTheDocument();
  });

  test("a SOAP draft is saved against the chosen visit", async () => {
    route();
    mockApi.post.mockResolvedValue({ data: { id: 1 } });
    render(<DictatePage />);
    await chooseOption("Patient (optional)", "riv", "Rivera, Test");
    await screen.findByLabelText("Visit for this note");
    await chooseOption("Note type (optional)", "prog", "Progress Note");

    const button = screen.getByRole("button", { name: "Open as a draft Progress Note" });
    expect(button).toBeDisabled(); // nothing dictated yet
    expect(screen.getByText(/you still need some dictated text/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Subjective"), { target: { value: "Cough for three days." } });
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    expect(mockApi.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/clinical-notes/"),
      { appointment: 501, note_type: "doctor_assessment", documentation_type: "progress_note", subjective: "Cough for three days.", objective: "", assessment: "", plan: "" },
      expect.anything()
    );
    expect(await screen.findByText(/Saved as a draft Progress Note for Rivera, Test/)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("power-dictate-recent-note-types"))).toEqual(["progress_note"]);
  });

  test("a template note sends its values as structured data with the template", async () => {
    route();
    mockApi.post.mockResolvedValue({ data: { id: 2 } });
    render(<DictatePage />);
    await chooseOption("Patient (optional)", "riv", "Rivera, Test");
    await screen.findByLabelText("Visit for this note");
    await chooseOption("Note type (optional)", "adm", "Admission Note");

    fireEvent.change(await screen.findByLabelText("Chief complaint"), { target: { value: "Cough" } });
    fireEvent.click(screen.getByRole("button", { name: "Open as a draft Admission Note" }));

    await waitFor(() => expect(mockApi.post).toHaveBeenCalled());
    expect(mockApi.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/clinical-notes/"),
      { appointment: 501, note_type: "doctor_assessment", documentation_type: "admission_note", template: 9, structured_data: { cc: "Cough" } },
      expect.anything()
    );
  });

  test("a refused save shows the reason and keeps the dictation", async () => {
    route();
    mockApi.post.mockRejectedValue({ response: { data: { detail: "You may not write this note type." } } });
    render(<DictatePage />);
    await chooseOption("Patient (optional)", "riv", "Rivera, Test");
    await screen.findByLabelText("Visit for this note");
    await chooseOption("Note type (optional)", "prog", "Progress Note");
    fireEvent.change(screen.getByLabelText("Subjective"), { target: { value: "Cough." } });
    fireEvent.click(screen.getByRole("button", { name: "Open as a draft Progress Note" }));
    expect(await screen.findByText("You may not write this note type.")).toBeInTheDocument();
    expect(screen.getByLabelText("Subjective")).toHaveValue("Cough.");
  });

  test("without a patient, a note type still fills fields for copying", async () => {
    route();
    render(<DictatePage />);
    await chooseOption("Note type (optional)", "prog", "Progress Note");
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "Rest." } });
    expect(screen.getByRole("button", { name: "Open as a draft Progress Note" })).toBeDisabled();
    expect(screen.getByText(/you still need a patient/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy text instead" })).toBeEnabled();
  });
});

describe("helpers", () => {
  test("buildOptions puts recent types first and lets a template replace a built-in", () => {
    const options = buildOptions([{ code: "progress_note", name: "Progress Note (custom)", fields: [{}, {}, {}] }, { code: "consult", name: "Consult" }], ["consult", "gone"]);
    expect(options.map((o) => `${o.group}:${o.code}`)).toEqual([
      "Recently used:consult",
      "All note types:initial_assessment",
      "All note types:progress_note",
    ]);
    expect(options.find((o) => o.code === "progress_note")).toMatchObject({ kind: "template", name: "Progress Note (custom)", detail: "3 fields" });
    expect(options.find((o) => o.code === "initial_assessment").kind).toBe("soap");
  });

  test("toPatient and formatDob", () => {
    expect(formatDob("1961-03-14")).toBe("03/14/1961");
    expect(formatDob(null)).toBe("");
    expect(toPatient({ user_id: 5, first_name: "A", last_name: "B", mrn: "MRN-1", date_of_birth: "2000-01-02" })).toEqual({ userId: 5, name: "B, A", mrn: "MRN-1", dob: "01/02/2000" });
  });
});
