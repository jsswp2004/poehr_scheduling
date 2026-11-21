import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    pharmacyQueue: "/pharmacy/queue/",
    pharmacyOrder: (id) => `/pharmacy/orders/${id}/`,
    pharmacyOrderAction: (id) => `/pharmacy/orders/${id}/action/`,
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { api } from "../../api/client";
import { toast } from "react-toastify";
import VerificationQueue from "../pharmacy/VerificationQueue";
import VerifyOrderDialog from "../pharmacy/VerifyOrderDialog";

const ROW = {
  id: 7,
  patient: { id: 3, name: "Dela Cruz, Juan" },
  drug: { generic: "Piperacillin-tazobactam", brand: "Zosyn", display: "Piperacillin-tazobactam (Zosyn)" },
  dangerous_drug: false,
  dose: "4.5 g",
  route: "IV",
  frequency: "q8h",
  frequency_label: "Every 8 hours",
  priority: "stat",
  pharmacy_status: "pending_verification",
  pharmacy_status_label: "Pending verification",
  ordering_provider: { id: 2, name: "Rizal, Jose" },
  waiting_minutes: 38,
  goal_minutes: 15,
  past_goal: true,
  care_setting_label: "Acute Care",
  alert_counts: { high: 1, moderate: 0 },
};
const MORPHINE = {
  ...ROW,
  id: 8,
  priority: "routine",
  drug: { generic: "Morphine sulfate 2 mg IV", brand: "", display: "Morphine sulfate 2 mg IV" },
  dangerous_drug: true,
  past_goal: false,
  alert_counts: { high: 0, moderate: 0 },
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  toast.success.mockReset();
});

describe("VerificationQueue", () => {
  test("lists the queue with counts, generic name first and the dangerous-drug chip", async () => {
    api.get.mockResolvedValue({ data: { counts: { pending_verification: 2, on_hold_clarify: 1, verified: 5, rejected: 0, past_goal: 1 }, results: [ROW, MORPHINE] } });
    render(<VerificationQueue role="pharmacist" />);
    await screen.findByTestId("queue-row-7");
    expect(screen.getByTestId("queue-tab-pending_verification")).toHaveTextContent("Pending (2)");
    expect(screen.getByTestId("queue-tab-on_hold_clarify")).toHaveTextContent("On hold (1)");
    expect(screen.getByTestId("queue-past-goal")).toHaveTextContent("1 past goal");
    const drug = screen.getByTestId("queue-drug-7");
    expect(drug.textContent.indexOf("Piperacillin-tazobactam")).toBeLessThan(drug.textContent.indexOf("(Zosyn)"));
    expect(screen.getByTestId("queue-row-8")).toHaveTextContent("Dangerous drug");
    expect(screen.getByTestId("queue-row-7")).toHaveTextContent("STAT");
    // past its verification goal: flagged Overdue; the order within goal is not
    expect(screen.getByTestId("queue-overdue-7")).toHaveTextContent("Overdue");
    expect(screen.queryByTestId("queue-overdue-8")).toBeNull();
    expect(api.get.mock.calls[0][1].params).toEqual({ status: "pending_verification" });
  });

  test("switching queues reloads with that status", async () => {
    api.get.mockResolvedValue({ data: { counts: {}, results: [] } });
    render(<VerificationQueue role="pharmacist" />);
    await screen.findByTestId("queue-empty");
    fireEvent.click(screen.getByTestId("queue-tab-verified"));
    await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.status === "verified")).toBe(true));
  });

  test("a pharmacy assistant reads the queue only", async () => {
    api.get.mockResolvedValue({ data: { counts: {}, results: [] } });
    render(<VerificationQueue role="pharmacy_tech" />);
    expect(await screen.findByTestId("queue-count")).toHaveTextContent("read-only");
  });
});

const ORDER = {
  ...ROW,
  instructions: "",
  indication: "Hospital-acquired pneumonia",
  signed_at: "2026-11-20T08:00:00Z",
  can_verify: true,
  renal: { weight_kg: 52, scr: "1.4", scr_units: "mg/dL", crcl: 38.7 },
  interventions: [],
  alerts: [
    { key: "allergy:4", type: "allergy", severity: "high", title: "Allergy: Penicillin", message: "Same drug class as the allergy: patient is allergic to Penicillin." },
  ],
};

describe("VerifyOrderDialog", () => {
  test("a high-severity alert must be acknowledged with a reason before Verify", async () => {
    api.get.mockResolvedValue({ data: ORDER });
    api.post.mockResolvedValue({ data: {} });
    const onClose = jest.fn();
    render(<VerifyOrderDialog open orderId={7} canVerify onClose={onClose} />);
    await screen.findByTestId("cds-alert-allergy:4");
    expect(screen.getByTestId("verify-drug")).toHaveTextContent("Piperacillin-tazobactam");
    expect(screen.getByTestId("verify-renal")).toHaveTextContent("38.7 mL/min");
    const verify = screen.getByTestId("action-verify");
    expect(verify).toBeDisabled();
    fireEvent.click(screen.getByTestId("ack-allergy:4"));
    expect(verify).toBeDisabled(); // still needs a reason
    fireEvent.change(screen.getByTestId("verify-reason"), { target: { value: "Tolerated before; ID agrees" } });
    expect(verify).not.toBeDisabled();
    fireEvent.click(verify);
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][0]).toBe("/pharmacy/orders/7/action/");
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "verify", acknowledged_alerts: ["allergy:4"], reason: "Tolerated before; ID agrees" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("Order verified.");
  });

  test("Clarify with Prescriber asks for the question, then sends it", async () => {
    api.get.mockResolvedValue({ data: { ...ORDER, alerts: [] } });
    api.post.mockResolvedValue({ data: {} });
    render(<VerifyOrderDialog open orderId={7} canVerify onClose={() => {}} />);
    await screen.findByTestId("action-clarify");
    fireEvent.click(screen.getByTestId("action-clarify"));
    expect(screen.getByText("Clarify with prescriber")).toBeInTheDocument();
    expect(screen.queryByTestId("action-verify")).toBeNull();
    expect(screen.getByTestId("action-clarify")).toBeDisabled();
    fireEvent.change(screen.getByTestId("verify-reason"), { target: { value: "Please confirm dose for weight 52 kg" } });
    fireEvent.click(screen.getByTestId("action-clarify"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "clarify", reason: "Please confirm dose for weight 52 kg" });
  });

  test("Verify with Change sends only what changed", async () => {
    api.get.mockResolvedValue({ data: { ...ORDER, alerts: [] } });
    api.post.mockResolvedValue({ data: {} });
    render(<VerifyOrderDialog open orderId={7} canVerify onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("action-modify"));
    expect(screen.getByTestId("modify-form")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("modify-dose"), { target: { value: "3.375 g" } });
    fireEvent.change(screen.getByTestId("verify-reason"), { target: { value: "Renal dose adjustment" } });
    fireEvent.click(screen.getByTestId("action-modify"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1]).toMatchObject({ action: "modify", new_value: { dose: "3.375 g" }, reason: "Renal dose adjustment" });
  });

  test("Reject needs a reason", async () => {
    api.get.mockResolvedValue({ data: { ...ORDER, alerts: [] } });
    api.post.mockResolvedValue({ data: {} });
    render(<VerifyOrderDialog open orderId={7} canVerify onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("action-reject"));
    expect(screen.getByTestId("action-reject")).toBeDisabled();
    fireEvent.change(screen.getByTestId("verify-reason"), { target: { value: "Duplicate therapy" } });
    fireEvent.click(screen.getByTestId("action-reject"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ action: "reject", reason: "Duplicate therapy" }));
  });

  test("read-only without the right to verify", async () => {
    api.get.mockResolvedValue({ data: ORDER });
    render(<VerifyOrderDialog open orderId={7} canVerify={false} onClose={() => {}} />);
    await screen.findByTestId("cds-alert-allergy:4");
    expect(screen.queryByTestId("action-verify")).toBeNull();
    expect(screen.queryByTestId("action-reject")).toBeNull();
    expect(screen.queryByTestId("ack-allergy:4")).toBeNull();
  });
});

describe("Formulary items not yet reviewed by a pharmacist", () => {
  test("the queue shows the warning chip on that order only", async () => {
    api.get.mockResolvedValue({ data: { counts: { pending_verification: 2 }, results: [{ ...ROW, needs_review: true }, MORPHINE] } });
    render(<VerificationQueue role="pharmacist" />);
    expect(await screen.findByTestId("queue-needs-review-7")).toHaveTextContent("Not yet reviewed by a pharmacist");
    expect(screen.queryByTestId("queue-needs-review-8")).toBeNull();
  });

  test("the verify dialog warns but still offers Verify", async () => {
    api.get.mockResolvedValue({ data: { ...ORDER, needs_review: true } });
    render(<VerifyOrderDialog open orderId={7} canVerify onClose={() => {}} />);
    expect(await screen.findByTestId("verify-needs-review")).toHaveTextContent("Not yet reviewed by a pharmacist");
    expect(screen.getByTestId("action-verify")).toBeInTheDocument();
  });
});
