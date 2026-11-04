import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DocumentsPanel from "./DocumentsPanel";
import { surgeryApi } from "./surgeryApi";
import { documentProblem, fileSize } from "./surgeryUtils";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({ surgeryApi: { documents: jest.fn(), uploadDocument: jest.fn(), downloadDocument: jest.fn(), removeDocument: jest.fn() } }));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const lookups = { document_categories: [{ value: "consent", label: "Consent" }, { value: "other", label: "Other" }] };
const doc = (o = {}) => ({ id: 1, title: "Signed consent", category: "consent", category_label: "Consent", filename: "consent.pdf", content_type: "application/pdf", size: 2048, uploaded_by: "Joseph, Marie", uploaded_at: "2026-11-03T10:50:00-05:00", can_delete: true, ...o });
const pick = (file) => fireEvent.change(screen.getByLabelText("Choose file"), { target: { files: [file] } });
const pdf = (name = "consent.pdf", size = 100) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

beforeEach(() => surgeryApi.documents.mockResolvedValue([doc()]));

test("file checks mirror the server's rules", () => {
  expect(documentProblem(null)).toBe("Choose a file.");
  expect(documentProblem(pdf("a.pdf"))).toBe("");
  expect(documentProblem(pdf("a.PNG"))).toBe("");
  expect(documentProblem(pdf("a.exe"))).toMatch(/Only PDF/);
  expect(documentProblem(pdf("a.pdf", 0))).toMatch(/empty/);
  expect(documentProblem({ name: "a.pdf", size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
  expect(fileSize(2048)).toBe("2.0 KB");
  expect(fileSize(300)).toBe("300 B");
});

test("lists documents", async () => {
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  expect(await screen.findByText("Signed consent")).toBeInTheDocument();
  expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  expect(screen.getByText(/Joseph, Marie/)).toBeInTheDocument();
});

test("uploads the chosen file with its type and title", async () => {
  surgeryApi.uploadDocument.mockResolvedValue(doc({ id: 2, title: "H&P", category: "history_physical", category_label: "History & Physical" }));
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  await screen.findByText("Signed consent");
  expect(screen.getByRole("button", { name: "Upload" })).toBeDisabled();
  pick(pdf("hp.pdf"));
  fireEvent.change(screen.getByLabelText("Title (optional)"), { target: { value: "H&P" } });
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  await waitFor(() => expect(surgeryApi.uploadDocument).toHaveBeenCalledTimes(1));
  const [id, form] = surgeryApi.uploadDocument.mock.calls[0];
  expect(id).toBe(1);
  expect(form.get("title")).toBe("H&P");
  expect(form.get("category")).toBe("other");
  expect(form.get("file").name).toBe("hp.pdf");
  expect(await screen.findByText("H&P")).toBeInTheDocument();
});

test("a wrong file type is refused before it is sent", async () => {
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  await screen.findByText("Signed consent");
  pick(pdf("run.exe"));
  expect(await screen.findByText("Only PDF, PNG and JPEG files can be uploaded.")).toBeInTheDocument();
  expect(surgeryApi.uploadDocument).not.toHaveBeenCalled();
});

test("a server refusal is shown", async () => {
  surgeryApi.uploadDocument.mockRejectedValue({ response: { data: { detail: "That file is not a real PDF." } } });
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  await screen.findByText("Signed consent");
  pick(pdf("fake.pdf"));
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  expect(await screen.findByText("That file is not a real PDF.")).toBeInTheDocument();
});

test("downloads through the API and saves under the original name", async () => {
  surgeryApi.downloadDocument.mockResolvedValue(new Blob(["x"]));
  global.URL.createObjectURL = jest.fn(() => "blob:1");
  global.URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  fireEvent.click(await screen.findByLabelText("Download Signed consent"));
  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(surgeryApi.downloadDocument).toHaveBeenCalledWith(1, 1);
  expect(global.URL.revokeObjectURL).toHaveBeenCalledWith("blob:1");
});

test("remove shows only when the server allows it, and removes", async () => {
  surgeryApi.documents.mockResolvedValue([doc(), doc({ id: 2, title: "Not mine", can_delete: false })]);
  surgeryApi.removeDocument.mockResolvedValue();
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  await screen.findByText("Not mine");
  expect(screen.queryByLabelText("Remove Not mine")).toBeNull();
  fireEvent.click(screen.getByLabelText("Remove Signed consent"));
  await waitFor(() => expect(surgeryApi.removeDocument).toHaveBeenCalledWith(1, 1));
  await waitFor(() => expect(screen.queryByText("Signed consent")).toBeNull());
});

test("a failed download is reported", async () => {
  surgeryApi.downloadDocument.mockRejectedValue({ response: { data: { detail: "The file is missing from storage." } } });
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit />);
  fireEvent.click(await screen.findByLabelText("Download Signed consent"));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("The file is missing from storage."));
});

test("a read-only viewer can download but not upload", async () => {
  render(<DocumentsPanel caseId={1} lookups={lookups} canEdit={false} />);
  await screen.findByText("Signed consent");
  expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
  expect(screen.getByLabelText("Download Signed consent")).toBeInTheDocument();
});
