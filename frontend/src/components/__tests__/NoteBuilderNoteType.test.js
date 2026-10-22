import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      dictionariesAdmin: "/dicts/",
      dictionaryAdmin: (id) => `/dicts/${id}/`,
      noteTemplateAdmin: (c) => `/tpl/${c}/`,
      noteTemplatesAdmin: "/tpls/",
      noteTemplatesSampleCsv: "/sample/",
      noteTemplatesUploadCsv: "/upload/",
      noteTemplateDownloadCsv: (c) => `/dl/${c}/`,
    },
  }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });

import { api } from "../../api/client";
import TemplateListView from "../noteBuilder/TemplateListView";
import NoteTemplateEditor from "../noteBuilder/NoteTemplateEditor";
import DictionaryManager from "../noteBuilder/DictionaryManager";

const NOTE_TYPES = {
  id: 9,
  code: "note_types",
  name: "Note types",
  description: "",
  usage_count: 0,
  is_system: true,
  items: [
    { id: 1, value: "progress", label: "Progress", sort_order: 1, usage_count: 2 },
    { id: 2, value: "discharge", label: "Discharge", sort_order: 2, usage_count: 0 },
  ],
};
const OTHER = { id: 3, code: "colors", name: "Colors", description: "", usage_count: 0, is_system: false, items: [{ id: 7, value: "red", label: "Red", sort_order: 1, usage_count: null }] };

const TPL = (code, name, noteType, label) => ({
  code,
  name,
  kind: "note",
  version: 1,
  is_active: true,
  note_type: noteType,
  note_type_label: label,
  fields: [{ id: 1, key: "k1", label: "Field 1", field_type: "text", section_label: "", tab_label: "" }],
});

beforeEach(() => {
  jest.clearAllMocks();
});

test("list: Note type column, filter chips with counts, Not set, and filtering", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/dicts/") return Promise.resolve({ data: [NOTE_TYPES, OTHER] });
    return Promise.resolve({ data: [TPL("progress_note", "Progress Note", "progress", "Progress"), TPL("wound", "Wound Care Note", "", "")] });
  });
  render(<TemplateListView onEdit={() => {}} onNew={() => {}} onManageNoteTypes={() => {}} />);
  expect(await screen.findByText("Progress Note")).toBeInTheDocument();
  expect(screen.getByRole("columnheader", { name: "Note type" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "All · 2" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Progress · 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Discharge · 0" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Not set · 1" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Progress · 1" }));
  expect(screen.getByText("Progress Note")).toBeInTheDocument();
  expect(screen.queryByText("Wound Care Note")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Not set · 1" }));
  expect(screen.queryByText("Progress Note")).toBeNull();
  expect(screen.getByText("Wound Care Note")).toBeInTheDocument();
});

test("list: search narrows by name or code", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/dicts/") return Promise.resolve({ data: [NOTE_TYPES] });
    return Promise.resolve({ data: [TPL("progress_note", "Progress Note", "progress", "Progress"), TPL("wound", "Wound Care Note", "", "")] });
  });
  render(<TemplateListView onEdit={() => {}} onNew={() => {}} />);
  await screen.findByText("Progress Note");
  fireEvent.change(screen.getByLabelText("Search templates"), { target: { value: "wound" } });
  expect(screen.queryByText("Progress Note")).toBeNull();
  expect(screen.getByText("Wound Care Note")).toBeInTheDocument();
});

test("list: order detail forms have no Note type column or chips", async () => {
  api.get.mockResolvedValue({ data: [{ ...TPL("dose", "Dose form", "", ""), kind: "order_detail" }] });
  render(<TemplateListView onEdit={() => {}} onNew={() => {}} kind="order_detail" />);
  await screen.findByText("Dose form");
  expect(screen.queryByRole("columnheader", { name: "Note type" })).toBeNull();
  expect(screen.queryByText("Note type")).toBeNull();
});

test("editor: pinned header shows the note type, Details tab has the picker, and Save sends note_type", async () => {
  api.get.mockImplementation((url) => {
    if (url === "/dicts/") return Promise.resolve({ data: [NOTE_TYPES] });
    return Promise.resolve({ data: TPL("progress_note", "Progress Note", "progress", "Progress") });
  });
  api.put.mockResolvedValue({ data: { version: 1, version_bumped: false, signed_notes_count: 0 } });
  render(<NoteTemplateEditor templateCode="progress_note" onBack={() => {}} onManageNoteTypes={() => {}} />);

  const header = await screen.findByTestId("editor-sticky-header");
  await waitFor(() => expect(header).toHaveTextContent("Progress"));
  expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Fields (1)", "Preview", "Details"]);

  fireEvent.click(screen.getByRole("tab", { name: "Details" }));
  expect(screen.getByLabelText("Note type")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage note types" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Save Template" }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  expect(api.put.mock.calls[0][1]).toEqual(expect.objectContaining({ note_type: "progress", code: "progress_note" }));
});

test("editor: a new template opens on Details", async () => {
  api.get.mockResolvedValue({ data: [NOTE_TYPES] });
  render(<NoteTemplateEditor templateCode={null} onBack={() => {}} />);
  expect(await screen.findByLabelText("Note type")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Details" })).toHaveAttribute("aria-selected", "true");
});

test("dictionaries: note types sits first, can't be deleted, and a value in use is locked", async () => {
  api.get.mockResolvedValue({ data: [OTHER, NOTE_TYPES] });
  render(<DictionaryManager />);
  const summaries = await screen.findAllByRole("button", { name: /\(.*\)/ });
  expect(summaries[0]).toHaveTextContent("Note types");
  expect(summaries[0]).toHaveTextContent("Used by templates");

  fireEvent.click(summaries[0]);
  expect(await screen.findByText(/These values fill the Note type picker/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Delete Dictionary" })).toBeNull();
  expect(screen.getByRole("button", { name: "Remove Progress" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove Discharge" })).toBeEnabled();
  expect(screen.getByText("used by 2 templates")).toBeInTheDocument();
  expect(screen.getByText("not used")).toBeInTheDocument();
});

test("dictionaries: a server refusal is shown in words", async () => {
  api.get.mockResolvedValue({ data: [NOTE_TYPES] });
  api.put.mockRejectedValue({ response: { data: { items: "'Progress' is used by 2 note template(s). Move them to another note type before deleting it." } } });
  render(<DictionaryManager />);
  const summaries = await screen.findAllByRole("button", { name: /\(.*\)/ });
  fireEvent.click(summaries[0]);
  fireEvent.click(await screen.findByRole("button", { name: "Remove Discharge" }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByText(/is used by 2 note template/)).toBeInTheDocument();
});

test("editor: fields are compact rows grouped by section, one inline editor at a time, Remove field works", async () => {
  const f = (id, section) => ({ id, key: `k${id}`, label: `Field ${id}`, field_type: "text", section_label: section, tab_label: "" });
  api.get.mockImplementation((url) => {
    if (url === "/dicts/") return Promise.resolve({ data: [NOTE_TYPES] });
    return Promise.resolve({ data: { ...TPL("progress_note", "Progress Note", "progress", "Progress"), fields: [f(1, "History"), f(2, "History"), f(3, "Pain")] } });
  });
  render(<NoteTemplateEditor templateCode="progress_note" onBack={() => {}} />);
  const list = await screen.findByTestId("field-list");
  expect(list).toHaveTextContent("Section: History");
  expect(list).toHaveTextContent("Section: Pain");
  expect(screen.queryByText(/Editing:/)).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Edit Field 1" }));
  expect(screen.getByText("Editing: Field 1")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Edit Field 2" }));
  expect(screen.getByText("Editing: Field 2")).toBeInTheDocument();
  expect(screen.queryByText("Editing: Field 1")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Remove field" }));
  expect(screen.queryByRole("button", { name: "Edit Field 2" })).toBeNull();
  expect(screen.getByRole("tab", { name: "Fields (2)" })).toBeInTheDocument();
});
