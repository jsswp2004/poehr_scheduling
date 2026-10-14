import { useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mockApi = { get: jest.fn(), post: jest.fn(), patch: jest.fn() };
jest.mock("../../api/client", () => ({ api: mockApi }), { virtual: true });
jest.mock("../patientHeader/headerApi", () => ({
  authHeader: async () => ({ Authorization: "Bearer t" }),
  errorText: (err, fallback) => err?.response?.data?.detail || fallback,
}));
jest.mock("../SimpleToast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }), { virtual: true });

// Stand-in for the microphone: tests push phrases through `speak`.
let mockOnText = null;
const mockDictation = { supported: true, status: "idle", partial: "", error: "", level: 0, toggle: jest.fn(), start: jest.fn(), stop: jest.fn() };
jest.mock("../dictation/useDictation", () => ({
  __esModule: true,
  default: (opts) => {
    mockOnText = opts && opts.onText;
    return mockDictation;
  },
}));

const { DictationProvider } = require("../dictation/DictationContext");
const DictationTextField = require("../dictation/DictationTextField").default;
const DictateNoteBar = require("../dictation/DictateNoteBar").default;
const { describeValue, mergeValue } = require("../dictation/DictateNoteBar");
const DictationSettings = require("../dictation/DictationSettings").default;

const speak = (text) => act(() => mockOnText(text));
const configure = (config) => mockApi.get.mockImplementation(async (url) => ({ data: config }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(mockDictation, { supported: true, status: "idle", partial: "", error: "" });
});

function Field({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return (
    <DictationProvider>
      <DictationTextField label="History" multiline value={value} onChange={(e) => setValue(e.target.value)} />
    </DictationProvider>
  );
}

describe("DictationTextField", () => {
  test("shows no microphone when dictation is off for the organization", async () => {
    configure({ enabled: false, cleanup: false, specialty: null });
    render(<Field />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /dictate/i })).toBeNull();
    expect(screen.getByLabelText("History")).toBeInTheDocument();
  });

  test("shows no microphone outside a provider (other screens are unchanged)", () => {
    render(<DictationTextField label="History" value="" onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: /dictate/i })).toBeNull();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  test("shows no microphone when the browser cannot capture audio", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    mockDictation.supported = false;
    render(<Field />);
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /dictate/i })).toBeNull();
  });

  test("when on, the microphone appears and dictated phrases are added after typed text", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    render(<Field initial="Cough" />);
    const mic = await screen.findByRole("button", { name: "Dictate History" });
    fireEvent.click(mic);
    expect(mockDictation.toggle).toHaveBeenCalled();
    speak("for three days.");
    expect(screen.getByLabelText("History")).toHaveValue("Cough for three days.");
    speak("No fever.");
    expect(screen.getByLabelText("History")).toHaveValue("Cough for three days. No fever.");
  });

  test("while listening it says so, shows the words so far, and can be stopped", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    Object.assign(mockDictation, { status: "listening", partial: "worse at night" });
    render(<Field />);
    expect(await screen.findByRole("button", { name: "Stop dictation for History" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("worse at night ...")).toBeInTheDocument();
  });

  test("an error from the microphone is shown under the field", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    mockDictation.error = "The microphone is blocked. Allow it in your browser and try again.";
    render(<Field />);
    expect(await screen.findByText(/microphone is blocked/i)).toBeInTheDocument();
  });
});

describe("DictateNoteBar", () => {
  const FIELDS = [
    { key: "hpi", label: "History of present illness", field_type: "textarea", options: [] },
    { key: "smoker", label: "Smoker", field_type: "radio", options: [{ value: "no", label: "No" }, { value: "yes", label: "Yes" }] },
  ];
  const PROPOSAL = {
    cleaned: "Three days of cough. Non-smoker.",
    fields: { hpi: "Three days of cough.", smoker: "no" },
    uncertain: ["mucinex"],
    unplaced: ["follow up in a week"],
  };

  const renderBar = (props = {}) => {
    const onApply = jest.fn();
    const existing = { hpi: "Seen last week." };
    render(
      <DictationProvider>
        <DictateNoteBar fields={FIELDS} getValue={(k) => existing[k]} onApply={onApply} {...props} />
      </DictationProvider>
    );
    return onApply;
  };

  test("is hidden unless both dictation and AI cleanup are on", async () => {
    configure({ enabled: true, cleanup: false, specialty: "PRIMARYCARE" });
    renderBar();
    await waitFor(() => expect(mockApi.get).toHaveBeenCalled());
    expect(screen.queryByText("Dictate whole note")).toBeNull();
  });

  test("dictate, clean up, review, accept some, apply", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    mockApi.post.mockResolvedValue({ data: PROPOSAL });
    const onApply = renderBar();
    await screen.findByText("Dictate whole note");
    speak("three days of cough no smoking");
    fireEvent.click(await screen.findByRole("button", { name: "Clean up & structure" }));

    const dialog = await screen.findByRole("dialog");
    expect(mockApi.post).toHaveBeenCalledWith(
      expect.stringContaining("/api/dictation/cleanup/"),
      { transcript: "three days of cough no smoking", fields: FIELDS },
      expect.anything()
    );
    expect(within(dialog).getByText("Three days of cough.")).toBeInTheDocument();
    expect(within(dialog).getByText("No")).toBeInTheDocument(); // option label, not the code
    expect(within(dialog).getByText("mucinex")).toBeInTheDocument();
    expect(within(dialog).getByText(/follow up in a week/)).toBeInTheDocument();
    expect(within(dialog).getByText(/added after what is already/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getAllByRole("checkbox")[1]); // drop "Smoker"
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply 1 accepted field" }));
    expect(onApply).toHaveBeenCalledWith({ hpi: "Seen last week.\nThree days of cough." });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("discarding applies nothing and keeps the dictation", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    mockApi.post.mockResolvedValue({ data: PROPOSAL });
    const onApply = renderBar();
    await screen.findByText("Dictate whole note");
    speak("some words");
    fireEvent.click(await screen.findByRole("button", { name: "Clean up & structure" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Discard" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Dictation \(you can edit/)).toHaveValue("some words");
  });

  test("a failed cleanup keeps the dictation and says what happened", async () => {
    configure({ enabled: true, cleanup: true, specialty: "PRIMARYCARE" });
    mockApi.post.mockRejectedValue({ response: { status: 503 } });
    renderBar();
    await screen.findByText("Dictate whole note");
    speak("words");
    fireEvent.click(await screen.findByRole("button", { name: "Clean up & structure" }));
    expect(await screen.findByText(/AI cleanup is not available right now/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Dictation \(you can edit/)).toHaveValue("words");
  });

  test("describeValue and mergeValue", () => {
    expect(describeValue(FIELDS[1], "yes")).toBe("Yes");
    expect(describeValue({ options: [{ value: "a", label: "Alpha" }] }, ["a", "b"])).toBe("Alpha, b");
    expect(mergeValue(FIELDS[0], "", "New")).toBe("New");
    expect(mergeValue(FIELDS[0], "Old  ", "New")).toBe("Old\nNew");
    expect(mergeValue(FIELDS[1], "yes", "no")).toBe("no");
  });
});

describe("DictationSettings", () => {
  const ORG = { id: 5, dictation_enabled: false, dictation_cleanup_enabled: true, dictation_specialty: "PRIMARYCARE", dictation_access: "authors" };

  test("turning dictation on and saving sends the setting and tells open note forms", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [ORG] } });
    mockApi.patch.mockResolvedValue({ data: { ...ORG, dictation_enabled: true } });
    const changed = jest.fn();
    window.addEventListener("dictation-config-changed", changed);

    render(<DictationSettings />);
    const toggle = await screen.findByRole("switch", { name: /Enable dictation/ });
    expect(toggle).not.toBeChecked();
    expect(screen.getByRole("switch", { name: /AI cleanup/ })).toBeDisabled(); // options wait for the master switch
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled(); // nothing to save yet

    fireEvent.click(toggle);
    expect(screen.getByRole("switch", { name: /AI cleanup/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(mockApi.patch).toHaveBeenCalled());
    expect(mockApi.patch).toHaveBeenCalledWith(
      expect.stringContaining("/api/users/organizations/5/"),
      { dictation_enabled: true, dictation_cleanup_enabled: true, dictation_specialty: "PRIMARYCARE", dictation_access: "authors" },
      expect.anything()
    );
    await waitFor(() => expect(changed).toHaveBeenCalled());
    window.removeEventListener("dictation-config-changed", changed);
  });

  test("shows the server's reason when saving is not allowed", async () => {
    mockApi.get.mockResolvedValue({ data: { results: [ORG] } });
    mockApi.patch.mockRejectedValue({ response: { data: { detail: "You do not have permission to edit organizations." } } });
    render(<DictationSettings />);
    fireEvent.click(await screen.findByRole("switch", { name: /Enable dictation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("You do not have permission to edit organizations.")).toBeInTheDocument();
  });
});
