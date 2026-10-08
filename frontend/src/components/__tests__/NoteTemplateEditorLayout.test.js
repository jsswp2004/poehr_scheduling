import { render, screen, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({ apiEndpoints: { dictionariesAdmin: "/dicts/", noteTemplateAdmin: (c) => `/tpl/${c}/`, noteTemplatesAdmin: "/tpls/" } }),
  { virtual: true }
);
jest.mock("../../utils/auth", () => ({ getValidToken: async () => ({ access_token: "t" }) }), { virtual: true });

import { api } from "../../api/client";
import NoteTemplateEditor from "../noteBuilder/NoteTemplateEditor";

const FIELD = (id, section) => ({ id, key: `k${id}`, label: `Field ${id}`, field_type: "text", section_label: section, tab_label: "" });

beforeEach(() => {
  api.get.mockImplementation((url) => {
    if (url === "/dicts/") return Promise.resolve({ data: [] });
    return Promise.resolve({ data: { code: "new_patient_hp", name: "New Patient Comprehensive H&P", is_active: true, version: 1, fields: [FIELD(1, "Review of Systems"), FIELD(2, "History of Present Illness")] } });
  });
});

// MUI 7's Grid sizes a cell with the `size` prop; the old `item xs sm` props are ignored and the cell shrinks to its content.
test("the Section picker, Tab name and Apply button are three sized grid cells", async () => {
  render(<NoteTemplateEditor templateCode="new_patient_hp" onBack={() => {}} />);
  const heading = await screen.findByText("Move a whole section to a tab");
  const cells = Array.from(heading.closest(".MuiPaper-root").querySelectorAll(".MuiGrid-container > .MuiGrid-root"));
  expect(cells).toHaveLength(3);
  cells.forEach((cell) => {
    // a sized cell has a share-of-the-row width; a cell with only the ignored legacy props has none
    expect(getComputedStyle(cell).width).toMatch(/calc\(100%/);
    // each control fills its cell
    expect(cell.querySelector(".MuiFormControl-fullWidth, .MuiButton-fullWidth")).not.toBeNull();
  });
  const sectionCell = cells[0];
  expect(sectionCell).toHaveTextContent("Section");
});

test("no leftover legacy Grid props in the note builder", () => {
  const fs = require("fs");
  const path = require("path");
  ["NoteTemplateEditor.js", "DictionaryManager.js"].forEach((f) => {
    const src = fs.readFileSync(path.join(__dirname, "..", "noteBuilder", f), "utf8");
    expect(src).not.toMatch(/<Grid item/);
  });
});
