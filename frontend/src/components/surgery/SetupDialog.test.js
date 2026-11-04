import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import SetupDialog from "./SetupDialog";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({
  surgeryApi: {
    lookups: jest.fn(), adminCards: jest.fn(), getCard: jest.fn(), createCard: jest.fn(), updateCard: jest.fn(),
    policies: jest.fn(), createPolicy: jest.fn(), updatePolicy: jest.fn(), prices: jest.fn(), savePrice: jest.fn(), removePrice: jest.fn(),
  },
}));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

beforeEach(() => {
  surgeryApi.lookups.mockResolvedValue({ usage_categories: [{ value: "UNSTERILE", label: "Unsterile" }, { value: "OTHER", label: "Other" }] });
  surgeryApi.adminCards.mockResolvedValue([{ id: 4, name: "TOMASULA, J - AV FISTULA", procedure_name: "AV FISTULA", is_active: true, surgeon: null }]);
  surgeryApi.policies.mockResolvedValue([]);
  surgeryApi.prices.mockResolvedValue([]);
});

const open = () => render(<SetupDialog open onClose={jest.fn()} />);

test("lists preference cards and creates one with supplies", async () => {
  surgeryApi.createCard.mockResolvedValue({ id: 9 });
  open();
  expect(await screen.findByText("TOMASULA, J - AV FISTULA")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "New Card" }));
  const dialog = await screen.findByRole("dialog", { name: "New Preference Card" });
  const save = within(dialog).getByRole("button", { name: "Save Card" });
  expect(save).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText("Card name"), { target: { value: "NEW CARD" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add Supply" }));
  fireEvent.change(within(dialog).getByLabelText("Supply 1 name"), { target: { value: "CHUCKS" } });
  fireEvent.change(within(dialog).getByLabelText("Supply 1 quantity"), { target: { value: "2" } });
  fireEvent.change(within(dialog).getByLabelText("Supply 1 charge code"), { target: { value: "OOR11665" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add Supply" })); // a blank second row is dropped on save
  fireEvent.click(save);
  await waitFor(() => expect(surgeryApi.createCard).toHaveBeenCalledTimes(1));
  const body = surgeryApi.createCard.mock.calls[0][0];
  expect(body.name).toBe("NEW CARD");
  expect(body.items).toEqual([expect.objectContaining({ name: "CHUCKS", quantity: 2, charge_code: "OOR11665", category: "OTHER" })]);
});

test("opening a card loads its supplies and saves changes with PATCH", async () => {
  surgeryApi.getCard.mockResolvedValue({ id: 4, name: "TOMASULA, J - AV FISTULA", procedure_name: "AV FISTULA", pre_op_notes: "", post_op_notes: "Clip", is_active: true,
    items: [{ id: 1, category: "UNSTERILE", name: "CHUCKS", catalog_number: "", quantity: 2, charge_code: "OOR11665", department: "" }] });
  surgeryApi.updateCard.mockResolvedValue({ id: 4 });
  open();
  fireEvent.click(await screen.findByText("TOMASULA, J - AV FISTULA"));
  const dialog = await screen.findByRole("dialog", { name: "Edit Preference Card" });
  expect(await within(dialog).findByDisplayValue("CHUCKS")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Remove supply 1" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Card" }));
  await waitFor(() => expect(surgeryApi.updateCard).toHaveBeenCalledWith(4, expect.objectContaining({ items: [], post_op_notes: "Clip" })));
});

test("a rejected card save is reported", async () => {
  surgeryApi.createCard.mockRejectedValue({ response: { data: { detail: "A card named X already exists." } } });
  open();
  fireEvent.click(await screen.findByRole("button", { name: "New Card" }));
  const dialog = await screen.findByRole("dialog", { name: "New Preference Card" });
  fireEvent.change(within(dialog).getByLabelText("Card name"), { target: { value: "X" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Card" }));
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith("A card named X already exists."));
});

test("creates a charge policy", async () => {
  surgeryApi.createPolicy.mockResolvedValue({ id: 1 });
  open();
  fireEvent.click(await screen.findByRole("tab", { name: "Charge Policies" }));
  fireEvent.click(await screen.findByRole("button", { name: "New Policy" }));
  const dialog = await screen.findByRole("dialog", { name: "New Charge Policy" });
  fireEvent.change(within(dialog).getByLabelText("Policy name"), { target: { value: "SUNY OR Time" } });
  fireEvent.change(within(dialog).getByLabelText("First block code"), { target: { value: "UOORL130" } });
  fireEvent.change(within(dialog).getByLabelText("Extra block code"), { target: { value: "UOORL115" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save Policy" }));
  await waitFor(() => expect(surgeryApi.createPolicy).toHaveBeenCalledWith(expect.objectContaining({
    name: "SUNY OR Time", policy_type: "case_time", time_basis: "or", first_code: "UOORL130", first_minutes: 30, extra_code: "UOORL115", extra_minutes: 15, is_active: true })));
});

test("lists existing policies", async () => {
  surgeryApi.policies.mockResolvedValue([{ id: 1, name: "Anes", policy_type: "case_time", time_basis: "anesthesia", first_code: "ANSG0001", first_minutes: 30, extra_code: "ANSG0002", extra_minutes: 15, is_active: true }]);
  open();
  fireEvent.click(await screen.findByRole("tab", { name: "Charge Policies" }));
  expect(await screen.findByText("ANSG0001 · 30 min")).toBeInTheDocument();
  expect(screen.getByText("ANSG0002 · every 15 min")).toBeInTheDocument();
  expect(screen.getByText("Anesthesia time")).toBeInTheDocument();
});

test("saves and removes prices", async () => {
  surgeryApi.prices.mockResolvedValueOnce([{ id: 3, charge_code: "OOR1", description: "Thing", unit_price: "7.25" }]).mockResolvedValue([]);
  surgeryApi.savePrice.mockResolvedValue({});
  surgeryApi.removePrice.mockResolvedValue();
  open();
  fireEvent.click(await screen.findByRole("tab", { name: "Price List" }));
  expect(await screen.findByText("7.25")).toBeInTheDocument();
  const add = screen.getByRole("button", { name: "Save Price" });
  expect(add).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Charge code"), { target: { value: "UOORL130" } });
  fireEvent.change(screen.getByLabelText("Unit price ($)"), { target: { value: "450" } });
  fireEvent.click(add);
  await waitFor(() => expect(surgeryApi.savePrice).toHaveBeenCalledWith({ charge_code: "UOORL130", description: "", unit_price: "450" }));
});

test("removing a price calls the API", async () => {
  surgeryApi.prices.mockResolvedValue([{ id: 3, charge_code: "OOR1", description: "", unit_price: "7.25" }]);
  surgeryApi.removePrice.mockResolvedValue();
  open();
  fireEvent.click(await screen.findByRole("tab", { name: "Price List" }));
  fireEvent.click(await screen.findByRole("button", { name: "Remove OOR1" }));
  await waitFor(() => expect(surgeryApi.removePrice).toHaveBeenCalledWith(3));
});
