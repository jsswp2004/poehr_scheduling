import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import VisitLinkDialog from "./VisitLinkDialog";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({ surgeryApi: { caseVisits: jest.fn(), updateCase: jest.fn() } }));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const visit = (o = {}) => ({ id: 3, visit_number: "VN-000003", date: "2026-11-03T08:00:00-05:00", care_setting: "Ambulatory Care", reason: "Hernia", location: "Suite L", status: "open", linked: false, other_case: null, ...o });
const props = { open: true, caseId: 1, onClose: jest.fn(), onLinked: jest.fn() };

beforeEach(() => surgeryApi.caseVisits.mockResolvedValue([visit(), visit({ id: 4, visit_number: "VN-000004", status: "discharged", other_case: 1002 })]));

test("lists the patient's visits and flags one already on another case", async () => {
  render(<VisitLinkDialog {...props} />);
  expect(await screen.findByText("VN-000003")).toBeInTheDocument();
  expect(screen.getByText("also on case 1002")).toBeInTheDocument();
  expect(screen.getByText("Discharged")).toBeInTheDocument();
});

test("filters by status and date range", async () => {
  render(<VisitLinkDialog {...props} />);
  await screen.findByText("VN-000003");
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } });
  await waitFor(() => expect(surgeryApi.caseVisits).toHaveBeenLastCalledWith(1, { date_from: "2026-10-01" }));
  fireEvent.mouseDown(screen.getByLabelText("Visit status"));
  fireEvent.click(await screen.findByRole("option", { name: "Open" }));
  await waitFor(() => expect(surgeryApi.caseVisits).toHaveBeenLastCalledWith(1, { date_from: "2026-10-01", status: "open" }));
});

test("ticking Link links the visit and unticking unlinks it", async () => {
  const onLinked = jest.fn();
  surgeryApi.updateCase.mockResolvedValue({ id: 1 });
  const { unmount } = render(<VisitLinkDialog {...props} onLinked={onLinked} />);
  fireEvent.click(await screen.findByLabelText("Link VN-000003"));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenCalledWith(1, { visit: 3 }));
  expect(onLinked).toHaveBeenCalled();
  unmount();
  surgeryApi.caseVisits.mockResolvedValue([visit({ linked: true })]);
  render(<VisitLinkDialog {...props} onLinked={onLinked} />);
  fireEvent.click(await screen.findByLabelText("Link VN-000003"));
  await waitFor(() => expect(surgeryApi.updateCase).toHaveBeenLastCalledWith(1, { visit: null }));
});

test("a refused link is reported", async () => {
  surgeryApi.updateCase.mockRejectedValue({ response: { data: { detail: "That visit belongs to a different patient." } } });
  render(<VisitLinkDialog {...props} />);
  fireEvent.click(await screen.findByLabelText("Link VN-000003"));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That visit belongs to a different patient."));
});

test("says so when the patient has no visits", async () => {
  surgeryApi.caseVisits.mockResolvedValue([]);
  render(<VisitLinkDialog {...props} />);
  expect(await screen.findByText("No visits found for this patient.")).toBeInTheDocument();
});
