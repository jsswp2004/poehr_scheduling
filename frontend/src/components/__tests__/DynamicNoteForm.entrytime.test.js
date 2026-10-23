import { render } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { noteChartData: "/api/note-chart-data/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });

import DynamicNoteForm from "../DynamicNoteForm";

const field = (key, type) => ({ id: key, key, label: key, field_type: type, section_label: "", tab_label: "", required: false, options: [] });
const TEMPLATE = { code: "t", name: "T", fields: [field("entry_date", "date"), field("entry_time", "text"), field("subjective", "textarea")] };

describe("entry date and time", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 22, 14, 32));
  });
  afterEach(() => jest.useRealTimers());

  test("a new note opens with today's date and the current time", () => {
    const onChange = jest.fn();
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={onChange} />);
    expect(onChange.mock.calls).toEqual([["entry_date", "2026-10-22"], ["entry_time", "14:32"]]);
  });

  test("leaves a value that is already there", () => {
    const onChange = jest.fn();
    render(<DynamicNoteForm template={TEMPLATE} values={{ entry_date: "2026-10-20", entry_time: "08:05" }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does nothing on a read-only form", () => {
    const onChange = jest.fn();
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={onChange} disabled />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
