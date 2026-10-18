import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockGet = jest.fn();
const mockPost = jest.fn();
jest.mock("axios", () => ({ get: (...a) => mockGet(...a), post: (...a) => mockPost(...a) }), { virtual: true });
jest.mock(
  "../../config/api",
  () => ({
    apiEndpoints: {
      documentationAssistant: "/api/documentation-assistant/message/",
      documentationAssistantStatus: "/api/documentation-assistant/status/",
    },
    getAuthHeaders: (t) => ({ Authorization: `Bearer ${t}` }),
  }),
  { virtual: true }
);
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "tok" }), { virtual: true });

import Dock, { resetDocumentationAssistantStatus } from "../DocumentationAssistantDock";

beforeEach(() => {
  resetDocumentationAssistantStatus(); // the dock remembers the server's answer for the page load
  mockGet.mockReset();
  mockPost.mockReset();
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

test("hidden when the server has the assistant off", async () => {
  mockGet.mockResolvedValue({ data: { enabled: false } });
  render(<Dock patientId={5} />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByLabelText("Documentation assistant")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Open assistant")).not.toBeInTheDocument();
});

test("hidden when the status call fails", async () => {
  mockGet.mockRejectedValue(new Error("403"));
  render(<Dock />);
  await waitFor(() => expect(mockGet).toHaveBeenCalled());
  expect(screen.queryByLabelText("Open assistant")).not.toBeInTheDocument();
});

test("shown when on; a chart question sends the open patient and shows the answer", async () => {
  mockGet.mockResolvedValue({ data: { enabled: true } });
  mockPost.mockResolvedValue({ data: { conversation_id: "c1", answer: "Ann Lee has one signed note.", actions: [], confirmations: [] } });
  render(<Dock patientId={7} patientName="Ann Lee" />);
  fireEvent.click(await screen.findByLabelText("Open assistant"));
  expect(screen.getByText(/Ann Lee's chart/)).toBeInTheDocument();
  expect(screen.getByText(/Read-only: I never change the chart/)).toBeInTheDocument();

  fireEvent.click(screen.getByText("Summarize this patient's chart"));
  expect(await screen.findByText("Ann Lee has one signed note.")).toBeInTheDocument();
  const [url, body, config] = mockPost.mock.calls[0];
  expect(url).toBe("/api/documentation-assistant/message/");
  expect(body).toEqual({ patient_id: 7, message: "Summarize this patient's chart", conversation_id: undefined });
  expect(config.headers.Authorization).toBe("Bearer tok");
});

test("with no chart open it offers general questions and sends no patient", async () => {
  mockGet.mockResolvedValue({ data: { enabled: true } });
  mockPost.mockResolvedValue({ data: { conversation_id: "c1", answer: "Found two.", actions: [], confirmations: [] } });
  render(<Dock />);
  fireEvent.click(await screen.findByLabelText("Open assistant"));
  fireEvent.click(screen.getByText("Find a patient"));
  await screen.findByText("Found two.");
  expect(mockPost.mock.calls[0][1]).not.toHaveProperty("patient_id");
});

test("a server error is shown in the chat instead of breaking the page", async () => {
  mockGet.mockResolvedValue({ data: { enabled: true } });
  mockPost.mockRejectedValue({ response: { data: { error: "The assistant isn't available right now." } } });
  render(<Dock />);
  fireEvent.click(await screen.findByLabelText("Open assistant"));
  fireEvent.click(screen.getByText("Find a patient"));
  expect(await screen.findByText("The assistant isn't available right now.")).toBeInTheDocument();
});
