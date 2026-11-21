import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    pharmacyFills: "/fills/",
    pharmacyFill: (id) => `/fills/${id}/`,
    pharmacyFillAction: (id) => `/fills/${id}/action/`,
    pharmacyFillCompletePartial: (id) => `/fills/${id}/complete-partial/`,
    pharmacyFillLabel: (id) => `/fills/${id}/label/`,
    pharmacyRefill: (id) => `/rx/${id}/refill/`,
    pharmacyPrices: "/prices/",
    pharmacyPrice: (id) => `/prices/${id}/`,
    pharmacyDiscountIds: (id) => `/patients/${id}/discount-ids/`,
    pharmacyMedProfile: (id) => `/med-profile/${id}/`,
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { api } from "../../api/client";
import OutpatientFillQueue from "../pharmacy/OutpatientFillQueue";
import FillDialog from "../pharmacy/FillDialog";
import { LabelBody } from "../pharmacy/PharmacyLabel";
import PriceTableDialog from "../pharmacy/PriceTableDialog";
import MedProfilePanel from "../pharmacy/MedProfilePanel";

const who = (name) => ({ name, at: "2026-11-21T02:00:00Z" });
const FILL = {
  id: 5,
  prescription: 42,
  rx_number: "RX-000042",
  fill_number: 1,
  is_refill: false,
  patient: { id: 3, name: "Dela Cruz, Juan" },
  drug: { generic: "Amoxicillin", brand: "Amoxil", display: "Amoxicillin (Amoxil)" },
  strength: "500 mg",
  form: "capsule",
  sig: "Take 1 capsule by mouth three times daily for 7 days.",
  prescribed_quantity: "21",
  quantity: null,
  quantity_unit: "capsules",
  balance: "21",
  is_partial: false,
  refills: 1,
  refills_used: 0,
  dangerous_drug: false,
  prescriber: "Rizal, Jose",
  stage: "received",
  stage_label: "Received",
  received: who(""),
  entered: null,
  filled: null,
  checked: null,
  dispensed: null,
  discount_ids: [],
  quote: { price_found: true, gross: "235.20", vat_exempt: "0.00", discount: "0.00", total: "235.20", discount_kind: "" },
  can_work: true,
  can_check: false,
  can_price: false,
  can_dispense: true,
  my_prc_license: "0045678",
  filled_by_me: false,
};

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

describe("Outpatient fill queue", () => {
  test("shows the stage tabs with counts and the rows, generic name first", async () => {
    api.get.mockResolvedValue({
      data: {
        counts: { received: 2, data_entry: 1, filling: 0, final_check: 3, ready: 1, dispensed: 9, on_hold: 1 },
        results: [FILL, { ...FILL, id: 6, rx_number: "RX-000043", dangerous_drug: true, drug: { generic: "Morphine sulfate", brand: "", display: "Morphine sulfate" } }],
        can_work: true,
      },
    });
    render(<OutpatientFillQueue />);
    await screen.findByTestId("fill-row-5");
    expect(screen.getByTestId("fill-tab-received")).toHaveTextContent("Received (2)");
    expect(screen.getByTestId("fill-tab-final_check")).toHaveTextContent("Final check (3)");
    expect(screen.getByTestId("fill-tab-ready")).toHaveTextContent("Ready for pickup (1)");
    expect(screen.getByTestId("fill-tab-on_hold")).toHaveTextContent("On hold (1)");
    const drug = screen.getByTestId("fill-drug-5").textContent;
    expect(drug.indexOf("Amoxicillin")).toBeLessThan(drug.indexOf("(Amoxil)"));
    expect(screen.getByTestId("fill-row-6")).toHaveTextContent("Dangerous drug");
    expect(api.get.mock.calls[0][1].params).toEqual({ stage: "received" });
  });

  test("switching stage reloads that stage", async () => {
    api.get.mockResolvedValue({ data: { counts: {}, results: [], can_work: true } });
    render(<OutpatientFillQueue />);
    await screen.findByTestId("fill-empty");
    fireEvent.click(screen.getByTestId("fill-tab-final_check"));
    await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.stage === "final_check")).toBe(true));
  });
});

describe("Fill dialog", () => {
  test("received: start data entry", async () => {
    api.get.mockResolvedValue({ data: FILL });
    api.post.mockResolvedValue({ data: { ...FILL, stage: "data_entry" } });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("fill-start"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/fills/5/action/", { action: "start_entry" }, expect.anything()));
  });

  test("hold needs a reason", async () => {
    api.get.mockResolvedValue({ data: { ...FILL, stage: "data_entry", stage_label: "Data entry" } });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    fireEvent.click(await screen.findByTestId("fill-hold"));
    expect(screen.getByTestId("fill-hold-confirm")).toBeDisabled();
    fireEvent.change(screen.getByTestId("fill-reason"), { target: { value: "Out of stock" } });
    fireEvent.click(screen.getByTestId("fill-hold-confirm"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toEqual({ action: "hold", reason: "Out of stock" }));
  });

  test("final check: only a pharmacist sees it, and all three confirmations are needed", async () => {
    const atCheck = { ...FILL, stage: "final_check", stage_label: "Pharmacist final check", quantity: "21", product_name: "Amoxil", product_strength: "500 mg", lot_number: "A1", expiry_date: "2027-11-01", entered: who("Silang, Gabriela"), filled: who("Silang, Gabriela") };
    api.get.mockResolvedValue({ data: atCheck });
    const { unmount } = render(<FillDialog open fillId={5} onClose={() => {}} />);
    await screen.findByTestId("form-final-check");
    expect(screen.queryByTestId("fill-check-pass")).toBeNull();
    expect(screen.getByText("Waiting for a pharmacist's final check.")).toBeInTheDocument();
    expect(screen.getByTestId("fill-steps")).toHaveTextContent("Filled: Silang, Gabriela");
    unmount();

    api.get.mockResolvedValue({ data: { ...atCheck, can_check: true } });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    const pass = await screen.findByTestId("fill-check-pass");
    expect(pass).toBeDisabled();
    fireEvent.click(screen.getByTestId("check-product_verified"));
    fireEvent.click(screen.getByTestId("check-strength_verified"));
    expect(pass).toBeDisabled();
    fireEvent.click(screen.getByTestId("check-quantity_verified"));
    expect(pass).not.toBeDisabled();
    fireEvent.click(pass);
    await waitFor(() => expect(api.post.mock.calls[0][1]).toEqual({ action: "check", product_verified: true, strength_verified: true, quantity_verified: true }));
  });

  test("dispense a dangerous drug: yellow Rx serial, S2 number and counseling are required", async () => {
    api.get.mockResolvedValue({ data: { ...FILL, stage: "ready", stage_label: "Ready for pickup", quantity: "10", dangerous_drug: true } });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    const go = await screen.findByTestId("fill-dispense");
    expect(screen.getByTestId("form-dangerous")).toBeInTheDocument();
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByTestId("fill-counseling-offered"), { target: { value: "yes" } });
    fireEvent.change(screen.getByTestId("fill-yellow_rx_serial"), { target: { value: "DDB-2026-0001234" } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByTestId("fill-s2_number"), { target: { value: "S2-12345" } });
    expect(go).not.toBeDisabled();
    fireEvent.click(go);
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ action: "dispense", counseling_offered: true, yellow_rx_serial: "DDB-2026-0001234", s2_number: "S2-12345" }));
  });

  test("senior citizen discount: shown in pesos and sent with the dispense", async () => {
    api.get.mockResolvedValue({
      data: {
        ...FILL, stage: "ready", stage_label: "Ready for pickup", quantity: "21",
        discount_ids: [{ id: 1, kind: "senior", id_number: "QC-SC-2019-004512" }],
        quote: { price_found: true, gross: "235.20", vat_exempt: "25.20", discount: "42.00", total: "168.00", discount_kind: "senior" },
      },
    });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    await screen.findByTestId("fill-price");
    expect(screen.getByTestId("fill-price")).toHaveTextContent("Total ₱168.00");
    fireEvent.change(screen.getByTestId("fill-counseling-offered"), { target: { value: "no" } });
    fireEvent.click(screen.getByTestId("fill-dispense"));
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ action: "dispense", discount_kind: "senior", counseling_offered: false }));
  });

  test("a partial fill offers to fill the balance", async () => {
    api.get.mockResolvedValue({ data: { ...FILL, stage: "dispensed", stage_label: "Dispensed", quantity: "12", balance: "9", is_partial: true, dispensed: who("Bonifacio, Andres"), total_amount: "134.40" } });
    api.post.mockResolvedValue({ data: {} });
    const onClose = jest.fn();
    render(<FillDialog open fillId={5} onClose={onClose} />);
    expect(await screen.findByTestId("fill-balance")).toHaveTextContent("Balance 9 capsules");
    fireEvent.click(screen.getByTestId("fill-complete-partial"));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/fills/5/complete-partial/", {}, expect.anything()));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  test("a dispensed dangerous drug offers no refill", async () => {
    api.get.mockResolvedValue({ data: { ...FILL, stage: "dispensed", stage_label: "Dispensed", quantity: "10", balance: "0", dangerous_drug: true, refills: 2 } });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    await screen.findByTestId("fill-dispensed");
    expect(screen.queryByTestId("fill-refill")).toBeNull();
  });
});

test("the label prints generic first, then brand, with the FDA LTO number", () => {
  render(
    <LabelBody
      label={{
        pharmacy_name: "Botika ng Klinika", pharmacy_address: "12 Rizal Ave, Quezon City", pharmacy_phone: "(02) 8123 4567", fda_lto_number: "LTO-3000001234567",
        rx_number: "RX-000042", fill_number: 1, fill_date: "2026-11-21", patient: "Dela Cruz, Juan",
        drug_line: "Amoxicillin (Amoxil) 500 mg capsule", sig: "Take 1 capsule by mouth three times daily for 7 days.",
        quantity: "21", quantity_unit: "capsules", prescriber: "Rizal, Jose", prescriber_license: "0123456",
        lot_number: "A1", expiry_date: "2027-11-01", refills_left: 1, dangerous_drug: false,
      }}
    />
  );
  expect(screen.getByTestId("label-drug")).toHaveTextContent("Amoxicillin (Amoxil) 500 mg capsule");
  expect(screen.getByTestId("label-lto")).toHaveTextContent("FDA LTO No. LTO-3000001234567");
  expect(screen.getByTestId("pharmacy-label")).toHaveTextContent("Filled 2026-11-21");
  expect(screen.getByTestId("pharmacy-label")).toHaveTextContent("Prescriber: Rizal, Jose · PRC Lic. 0123456");
});

test("price table: pharmacists add a price in pesos", async () => {
  api.get.mockResolvedValue({ data: { results: [{ id: 1, drug_name: "Amoxicillin", unit: "capsule", unit_price: "11.20", vat_exempt: false, is_active: true }], can_edit: true } });
  api.post.mockResolvedValue({ data: {} });
  render(<PriceTableDialog open onClose={() => {}} />);
  expect(await screen.findByTestId("price-row-1")).toHaveTextContent("₱11.20");
  fireEvent.change(screen.getByTestId("price-drug"), { target: { value: "Losartan 50 mg" } });
  fireEvent.change(screen.getByTestId("price-amount"), { target: { value: "18.50" } });
  fireEvent.click(screen.getByTestId("price-save"));
  await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ drug_name: "Losartan 50 mg", unit_price: "18.50" }));
});

test("the medication profile lists what was dispensed", async () => {
  api.get.mockResolvedValue({
    data: {
      renal: {}, allergies: [], no_known_allergies: true, orders: [], prescriptions: [], home_medications: [], interventions: [],
      dispensing: [{ ...FILL, stage: "dispensed", quantity: "21", balance: "0", dispensed: who("Silang, Gabriela"), total_amount: "235.20" }],
    },
  });
  render(<MedProfilePanel patient={{ id: 3, name: "Dela Cruz, Juan" }} role="pharmacist" />);
  const row = await screen.findByTestId("dispensed-5");
  expect(row).toHaveTextContent("Amoxicillin");
  expect(row).toHaveTextContent("RX-000042");
  expect(row).toHaveTextContent("Silang, Gabriela");
  expect(row).toHaveTextContent("₱235.20");
});


describe("Phase 2 follow-ups", () => {
  const READY = { ...FILL, stage: "ready", stage_label: "Ready for pickup", quantity: "21" };

  test("a pharmacist checking their own fill must give the single-pharmacist reason", async () => {
    api.get.mockResolvedValue({ data: { ...FILL, stage: "final_check", stage_label: "Pharmacist final check", quantity: "21", can_check: true, filled_by_me: true } });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    expect(await screen.findByTestId("form-single-pharmacist")).toHaveTextContent("A different pharmacist should do the final check");
    ["product_verified", "strength_verified", "quantity_verified"].forEach((k) => fireEvent.click(screen.getByTestId(`check-${k}`)));
    const pass = screen.getByTestId("fill-check-pass");
    expect(pass).toBeDisabled();
    fireEvent.change(screen.getByTestId("fill-single_pharmacist_reason"), { target: { value: "Only pharmacist on duty" } });
    fireEvent.click(pass);
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ action: "check", single_pharmacist_reason: "Only pharmacist on duty" }));
  });

  test("only a pharmacist can dispense", async () => {
    api.get.mockResolvedValue({ data: { ...READY, can_dispense: false } });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    expect(await screen.findByText("Only a pharmacist can dispense (RA 10918).")).toBeInTheDocument();
    expect(screen.queryByTestId("fill-dispense")).toBeNull();
  });

  test("no price in the price table: dispensing is blocked with a clear message", async () => {
    api.get.mockResolvedValue({ data: { ...READY, quote: { price_found: false } } });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    expect(await screen.findByTestId("fill-no-price")).toHaveTextContent("There is no price for Amoxicillin in the price table");
    fireEvent.change(screen.getByTestId("fill-counseling-offered"), { target: { value: "no" } });
    expect(screen.getByTestId("fill-dispense")).toBeDisabled();
  });

  test("a pharmacist without a PRC license on file enters it at dispense", async () => {
    api.get.mockResolvedValue({ data: { ...READY, my_prc_license: "" } });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    const go = await screen.findByTestId("fill-dispense");
    fireEvent.change(screen.getByTestId("fill-counseling-offered"), { target: { value: "no" } });
    expect(go).toBeDisabled();
    fireEvent.change(screen.getByTestId("fill-prc_license_number"), { target: { value: "0099887" } });
    fireEvent.click(go);
    await waitFor(() => expect(api.post.mock.calls[0][1]).toMatchObject({ action: "dispense", prc_license_number: "0099887" }));
  });

  test("senior and PWD IDs on file: only the one chosen is applied", async () => {
    api.get.mockResolvedValue({
      data: { ...READY, discount_ids: [{ id: 1, kind: "senior", id_number: "QC-SC-1" }, { id: 2, kind: "pwd", id_number: "QC-PWD-2" }] },
    });
    api.post.mockResolvedValue({ data: {} });
    render(<FillDialog open fillId={5} onClose={() => {}} />);
    await screen.findByTestId("fill-dispense");
    fireEvent.change(screen.getByTestId("fill-discount"), { target: { value: "pwd" } });
    fireEvent.change(screen.getByTestId("fill-counseling-offered"), { target: { value: "no" } });
    fireEvent.click(screen.getByTestId("fill-dispense"));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].discount_kind).toBe("pwd");
  });

  test("the label names the dispensing pharmacist and their PRC license", () => {
    render(<LabelBody label={{ pharmacy_name: "Botika ng Klinika", drug_line: "Amoxicillin (Amoxil) 500 mg capsule", dispensed_by: "Bonifacio, Andres", pharmacist_license: "0045678", refills_left: 0 }} />);
    expect(screen.getByTestId("label-pharmacist")).toHaveTextContent("Dispensed by Bonifacio, Andres · PRC Lic. 0045678");
  });

  test("the price table reminds that a pharmacist sets the VAT-exempt items", async () => {
    api.get.mockResolvedValue({ data: { results: [], can_edit: true } });
    render(<PriceTableDialog open onClose={() => {}} />);
    expect(await screen.findByTestId("price-vat-note")).toHaveTextContent("A pharmacist must mark the VAT-exempt items");
  });
});


test("the medication profile also lists what a partner pharmacy dispensed, with the actual product", async () => {
  api.get.mockResolvedValue({
    data: {
      renal: {}, allergies: [], no_known_allergies: true, orders: [], prescriptions: [], home_medications: [], interventions: [], dispensing: [],
      portal_dispensing: [{
        id: "portal-7", source: "Mercury Drug Cubao", rx_number: "RX-000042", fill_number: 1, is_refill: false,
        drug: { generic: "Losartan potassium", brand: "Lifezar", display: "Losartan potassium (Lifezar)" }, manufacturer: "Unilab",
        strength: "50 mg", quantity: "30", quantity_unit: "tablets", is_partial: false, dangerous_drug: false,
        dispensed: { name: "Bonifacio, Andres · Mercury Drug Cubao", at: "2026-11-21T03:00:00Z" }, total_amount: null,
      }],
    },
  });
  render(<MedProfilePanel patient={{ id: 3, name: "Reyes, Corazon" }} role="pharmacist" />);
  const row = await screen.findByTestId("dispensed-portal-7");
  expect(row).toHaveTextContent("Losartan potassium");
  expect(row).toHaveTextContent("Lifezar (Unilab)");
  expect(row).toHaveTextContent("Mercury Drug Cubao");
});

test("the fill dialog warns about a formulary item not yet reviewed by a pharmacist, without blocking", async () => {
  api.get.mockResolvedValue({ data: { ...FILL, needs_review: true } });
  api.post.mockResolvedValue({ data: { ...FILL, stage: "data_entry" } });
  render(<FillDialog open fillId={5} onClose={() => {}} />);
  expect(await screen.findByTestId("fill-needs-review")).toHaveTextContent("Not yet reviewed by a pharmacist");
  fireEvent.click(screen.getByTestId("fill-start"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/fills/5/action/", { action: "start_entry" }, expect.anything()));
});
