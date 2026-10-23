import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { noteChartData: "/api/note-chart-data/" } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });

import DynamicNoteForm, { sectionDefault } from "../DynamicNoteForm";

const ROS_OPTIONS = [
  { value: "negative", label: "Negative" },
  { value: "positive", label: "Positive" },
  { value: "not_reviewed", label: "Not reviewed" },
];
const radio = (key, label, options = ROS_OPTIONS, extra = {}) => ({
  id: key, key, label, field_type: "radio", section_label: "ROS", tab_label: "", required: false, options, ...extra,
});
const TEMPLATE = {
  code: "t", name: "T",
  fields: [
    radio("a", "General"), radio("b", "Skin"), radio("c", "Eye"),
    { id: "d", key: "d", label: "Eye findings", field_type: "text", section_label: "ROS", tab_label: "", depends_on_key: "c", depends_on_value: "positive", options: [] },
  ],
};

describe("Apply default", () => {
  test("sets every question in the section to the normal answer", () => {
    const onChange = jest.fn();
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Apply default (all Negative)" }));
    expect(onChange.mock.calls).toEqual([["a", "negative"], ["b", "negative"], ["c", "negative"]]);
  });

  test("is not offered to a read-only form", () => {
    render(<DynamicNoteForm template={TEMPLATE} values={{}} onChange={() => {}} disabled />);
    expect(screen.queryByRole("button", { name: /Apply default/ })).toBeNull();
  });

  test("works for exam findings too", () => {
    const options = [{ value: "normal", label: "Normal" }, { value: "abnormal", label: "Abnormal" }];
    const fields = ["a", "b", "c"].map((k) => radio(k, k, options));
    expect(sectionDefault(fields)).toEqual({ value: "normal", label: "Normal", keys: ["a", "b", "c"] });
  });

  test("not offered for fewer than three questions or without a normal answer", () => {
    expect(sectionDefault([radio("a", "A"), radio("b", "B")])).toBeNull();
    const yesNo = [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }];
    expect(sectionDefault(["a", "b", "c"].map((k) => radio(k, k, yesNo)))).toBeNull();
  });
});
