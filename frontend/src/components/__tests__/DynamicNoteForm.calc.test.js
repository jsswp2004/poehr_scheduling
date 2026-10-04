import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import DynamicNoteForm, { DynamicNoteSummary, buildNotePreviewSections } from "../DynamicNoteForm";

// A PHQ-9 as the note builder would hand it over: nine 0-3 radios and a
// calculated total with severity ranges and the question-9 caution.
const OPTIONS = [
  { value: "0", label: "Not at all" },
  { value: "1", label: "Several days" },
  { value: "2", label: "More than half the days" },
  { value: "3", label: "Nearly every day" },
];
const KEYS = Array.from({ length: 9 }, (_, i) => `phq9_q${i + 1}`);
const CAUTION = "Further assessment for suicide risk is needed.";
const TEMPLATE = {
  fields: [
    ...KEYS.map((key, i) => ({
      key,
      label: `Item ${i + 1}`,
      field_type: "radio",
      section_label: "PHQ-9",
      options: OPTIONS,
    })),
    {
      key: "phq9_total",
      label: "PHQ-9 total score",
      field_type: "calculated",
      section_label: "PHQ-9",
      options: [],
      calc: {
        operation: "sum",
        sources: KEYS,
        require_all: true,
        decimals: 0,
        bands: [
          { min: 0, max: 4, label: "None-minimal" },
          { min: 5, max: 9, label: "Mild" },
          { min: 10, max: 14, label: "Moderate" },
          { min: 15, max: 19, label: "Moderately severe" },
          { min: 20, max: 27, label: "Severe" },
        ],
        alerts: [{ source: "phq9_q9", min: 1, message: CAUTION }],
      },
    },
  ],
};

function Harness({ initial = {}, onValues }) {
  const [values, setValues] = useState(initial);
  onValues(values);
  return (
    <DynamicNoteForm
      template={TEMPLATE}
      values={values}
      onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
    />
  );
}

const answer = (itemNumber, optionLabel) => {
  const group = screen.getByText(`Item ${itemNumber}`).closest("fieldset");
  fireEvent.click(within(group).getByLabelText(optionLabel));
};

describe("calculated field in the note form", () => {
  it("shows a dash until every item is answered, then the total and its interpretation", () => {
    let latest = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    expect(screen.getByText("PHQ-9 total score")).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();

    for (let i = 1; i <= 8; i += 1) answer(i, "Several days");
    expect(screen.getByText("--")).toBeInTheDocument(); // item 9 still open
    answer(9, "Not at all");

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Mild")).toBeInTheDocument();
    // stored on the note's values, with its interpretation beside it
    expect(latest.phq9_total).toBe("8");
    expect(latest.phq9_total__interpretation).toBe("Mild");
    expect(screen.queryByText(CAUTION)).not.toBeInTheDocument();
  });

  it("recalculates when an answer changes and raises the item-9 caution", () => {
    let latest = {};
    render(<Harness onValues={(v) => (latest = v)} />);
    for (let i = 1; i <= 9; i += 1) answer(i, "Nearly every day");
    expect(latest.phq9_total).toBe("27");
    expect(screen.getByText("Severe")).toBeInTheDocument();
    expect(screen.getByText(CAUTION)).toBeInTheDocument();

    answer(9, "Not at all");
    expect(latest.phq9_total).toBe("24");
    expect(screen.queryByText(CAUTION)).not.toBeInTheDocument();
  });

  it("shows the caution even before the total can be worked out", () => {
    render(<Harness onValues={() => {}} />);
    answer(9, "Several days");
    expect(screen.getByText(CAUTION)).toBeInTheDocument();
    expect(screen.getByText("--")).toBeInTheDocument();
  });

  it("replaces a stale stored total on load", () => {
    let latest = {};
    const stale = Object.fromEntries(KEYS.map((k) => [k, "1"]));
    render(<Harness initial={{ ...stale, phq9_total: "99" }} onValues={(v) => (latest = v)} />);
    expect(latest.phq9_total).toBe("9");
    expect(latest.phq9_total__interpretation).toBe("Mild");
  });
});

describe("calculated field in a saved note and the preview", () => {
  const stored = {
    ...Object.fromEntries(KEYS.map((k) => [k, "2"])),
    phq9_total: "18",
    phq9_total__interpretation: "Moderately severe",
  };

  it("history shows the total with its interpretation and the caution", () => {
    render(<DynamicNoteSummary templateDetail={TEMPLATE} structuredData={stored} />);
    expect(screen.getByText("18 (Moderately severe)")).toBeInTheDocument();
    expect(screen.getByText(`Caution: ${CAUTION}`)).toBeInTheDocument();
  });

  it("preview and print text carry the result and the caution", () => {
    const sections = buildNotePreviewSections(TEMPLATE.fields, stored);
    const entry = sections[0].sections[0].entries.find((e) => e.label === "PHQ-9 total score");
    expect(entry.display).toBe(`18 (Moderately severe) -- Caution: ${CAUTION}`);
    expect(entry.empty).toBe(false);
  });

  it("an unanswered total is shown as not yet documented", () => {
    const sections = buildNotePreviewSections(TEMPLATE.fields, {});
    const entry = sections[0].sections[0].entries.find((e) => e.label === "PHQ-9 total score");
    expect(entry.empty).toBe(true);
  });
});
