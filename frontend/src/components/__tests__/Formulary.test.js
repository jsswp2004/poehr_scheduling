import { render, screen, fireEvent, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    formulary: "/f/",
    formularyItem: (id) => `/f/${id}/`,
    formularyRevert: (id) => `/f/${id}/revert/`,
    formularyHistory: (id) => `/f/${id}/history/`,
    formularyReview: (id) => `/f/${id}/review/`,
    formularyReviewers: "/f/reviewers/",
    formularyReviewer: (id) => `/f/reviewers/${id}/`,
    formularyExport: "/f/export/",
    formularyTemplate: "/f/template/",
    formularyImport: "/f/import/",
    formularyImports: "/f/imports/",
    formularyImportFile: (id) => `/f/imports/${id}/file/`,
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { api } from "../../api/client";
import FormularyPanel from "../pharmacy/FormularyPanel";
import FormularyItemDialog from "../pharmacy/FormularyItemDialog";
import FormularyImportDialog from "../pharmacy/FormularyImportDialog";

const shared = (over = {}) => ({
  generic_name: "shared", brand_name: "shared", strength: "shared", form: "shared", route: "shared", rxnorm_code: "shared",
  dangerous_drug: "shared", renal_threshold_crcl: "shared", is_active: "shared", unit: "shared", unit_price_php: "shared", vat_exempt: "shared", ...over,
});
const AMOX = {
  id: 1, code: "amoxicillin_500_capsule", scope: "shared", display: "Amoxicillin (Amoxil) 500 mg capsule",
  generic_name: "Amoxicillin", brand_name: "Amoxil", strength: "500 mg", form: "capsule", route: "PO", rxnorm_code: "308191",
  dangerous_drug: true, renal_threshold_crcl: null, is_active: true, unit: "capsule", unit_price_php: "12.5", vat_exempt: false,
  // prices are the clinic's own; the clinic overrides the dangerous-drug flag
  sources: shared({ unit_price_php: "clinic", unit: "clinic", vat_exempt: "clinic", dangerous_drug: "overridden" }),
  shared_values: { dangerous_drug: false }, overridden: ["dangerous_drug"],
  review: { status: "needs_review", reviewed_by: "", reviewed_at: null }, can_review: false,
};
const MORPHINE = {
  ...AMOX, id: 2, code: "morphine_10_tablet", display: "Morphine sulfate 10 mg tablet", generic_name: "Morphine sulfate", brand_name: "",
  strength: "10 mg", form: "tablet", rxnorm_code: "", dangerous_drug: true, unit_price_php: "38", unit: "tablet",
  sources: shared(), shared_values: {}, overridden: [],
  review: { status: "reviewed", reviewed_by: "Mabini, Apolinario", reviewed_at: "2026-11-20T02:00:00Z" },
};
const META = { can_edit: true, edits_shared: false, forms: ["tablet", "capsule"], routes: ["PO", "IV"], overridable: ["is_active", "dangerous_drug", "renal_threshold_crcl", "unit", "unit_price_php", "vat_exempt"] };

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.patch.mockReset();
});

test("the formulary lists items generic first with flags, price and which values are overridden", async () => {
  api.get.mockResolvedValue({ data: { ...META, results: [AMOX, MORPHINE] } });
  render(<FormularyPanel />);
  const amox = await screen.findByTestId("formulary-row-amoxicillin_500_capsule");
  expect(amox.textContent.indexOf("Amoxicillin")).toBeLessThan(amox.textContent.indexOf("(Amoxil)"));
  expect(amox).toHaveTextContent("₱12.50 / capsule");
  expect(screen.getByTestId("formulary-overridden-amoxicillin_500_capsule")).toHaveTextContent("1 overridden");
  expect(screen.getByTestId("formulary-row-morphine_10_tablet")).toHaveTextContent("Dangerous drug");
  fireEvent.change(screen.getByTestId("formulary-filter-scope"), { target: { value: "overridden" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.scope === "overridden")).toBe(true));
});

test("a pharmacy assistant sees the formulary without edit buttons", async () => {
  api.get.mockResolvedValue({ data: { ...META, can_edit: false, results: [AMOX] } });
  render(<FormularyPanel />);
  await screen.findByTestId("formulary-row-amoxicillin_500_capsule");
  expect(screen.queryByTestId("formulary-add")).toBeNull();
  expect(screen.queryByTestId("formulary-import")).toBeNull();
});

test("a clinic edits a shared item: the definition and RxNorm are locked, the price is its own, overrides can be reverted", async () => {
  api.post.mockResolvedValue({ data: { ...AMOX, dangerous_drug: false, sources: shared(), overridden: [], shared_values: {} } });
  api.patch.mockResolvedValue({ data: AMOX });
  const onSaved = jest.fn();
  render(<FormularyItemDialog open item={AMOX} meta={META} onClose={() => {}} onSaved={onSaved} />);
  expect(screen.getByTestId("fi-brand_name")).toBeDisabled();
  expect(screen.getByTestId("fi-rxnorm_code")).toBeDisabled();
  expect(screen.getByTestId("fi-unit_price_php")).not.toBeDisabled();
  expect(screen.queryByTestId("fi-overridden-unit_price_php")).toBeNull();
  expect(screen.getByTestId("fi-overridden-dangerous_drug")).toHaveTextContent("Shared: No");
  fireEvent.click(screen.getByTestId("fi-is_active"));
  fireEvent.click(screen.getByTestId("fi-save"));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/f/1/", { is_active: false }, expect.anything()));
  fireEvent.click(screen.getByTestId("fi-revert-dangerous_drug"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/f/1/revert/", { field: "dangerous_drug" }, expect.anything()));
});

test("items needing review show a badge and can be filtered", async () => {
  api.get.mockResolvedValue({ data: { ...META, results: [AMOX, MORPHINE] } });
  render(<FormularyPanel />);
  expect(await screen.findByTestId("formulary-review-amoxicillin_500_capsule")).toHaveTextContent("Needs review");
  expect(screen.queryByTestId("formulary-review-morphine_10_tablet")).toBeNull();
  fireEvent.change(screen.getByTestId("formulary-filter-review"), { target: { value: "needs_review" } });
  await waitFor(() => expect(api.get.mock.calls.some((c) => c[1].params.review === "needs_review")).toBe(true));
});

test("Mark reviewed is offered only when the user may review the item", async () => {
  api.post.mockResolvedValue({ data: { ...AMOX, review: { status: "reviewed", reviewed_by: "Mabini, Apolinario", reviewed_at: "2026-11-21T08:00:00Z" } } });
  const onSaved = jest.fn();
  const { unmount } = render(<FormularyItemDialog open item={AMOX} meta={META} onClose={() => {}} onSaved={onSaved} />);
  expect(screen.getByTestId("fi-review")).toHaveTextContent("Needs pharmacist review");
  expect(screen.queryByTestId("fi-mark-reviewed")).toBeNull();
  unmount();
  render(<FormularyItemDialog open item={{ ...AMOX, can_review: true }} meta={META} onClose={() => {}} onSaved={onSaved} />);
  fireEvent.click(screen.getByTestId("fi-mark-reviewed"));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith("/f/1/review/", {}, expect.anything()));
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ review: expect.objectContaining({ status: "reviewed" }) }), true));
});

test("a system administrator edits the shared item without prices", async () => {
  api.patch.mockResolvedValue({ data: MORPHINE });
  render(<FormularyItemDialog open item={MORPHINE} meta={{ ...META, edits_shared: true }} onClose={() => {}} onSaved={() => {}} />);
  expect(screen.getByTestId("fi-review")).toHaveTextContent("Reviewed by Mabini, Apolinario");
  expect(screen.queryByTestId("fi-unit_price_php")).toBeNull();
  expect(screen.getByTestId("fi-prices-per-clinic")).toHaveTextContent("Prices are set by each clinic");
  fireEvent.change(screen.getByTestId("fi-rxnorm_code"), { target: { value: "892494" } });
  fireEvent.click(screen.getByTestId("fi-save"));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/f/2/", { rxnorm_code: "892494" }, expect.anything()));
});

test("the item's history lists who changed what", async () => {
  api.get.mockResolvedValue({ data: { results: [{ id: 5, at: "2026-11-21T07:00:00Z", user: "Bonifacio, Andres", source: "import", scope: "clinic", import: { id: 3, filename: "manila-prices.csv" }, changes: { unit_price_php: ["11.2", "12.5"] } }] } });
  render(<FormularyItemDialog open item={AMOX} meta={META} onClose={() => {}} onSaved={() => {}} />);
  fireEvent.click(screen.getByTestId("fi-history-tab"));
  const h = await screen.findByTestId("fi-history");
  await waitFor(() => expect(h).toHaveTextContent("manila-prices.csv"));
  expect(h).toHaveTextContent("Price per unit (₱): 11.2 → 12.5");
});

test("import: preview shows new / changed / errors, apply only when the file is clean", async () => {
  const plan = {
    ok: false, counts: { new: 1, changed: 1, unchanged: 0 },
    rows: [{ row: 2, code: "amoxicillin_500_capsule", status: "changed", scope: "override", changes: { unit_price_php: ["11.2", "12"] } }, { row: 3, code: "lagundi_600_tablet", status: "new", changes: {} }],
    errors: [{ row: 4, column: "form", message: "Must be one of tablet, capsule." }],
    warnings: [{ row: 2, column: "rxnorm_code", message: "RxNorm code differs from the item's (308191)." }],
  };
  api.post.mockResolvedValue({ data: plan });
  const onApplied = jest.fn();
  render(<FormularyImportDialog open onClose={() => {}} onApplied={onApplied} />);
  const file = new File(["code,generic_name\n"], "manila.csv", { type: "text/csv" });
  fireEvent.change(screen.getByTestId("fimport-file"), { target: { files: [file] } });
  fireEvent.click(screen.getByTestId("fimport-preview"));
  expect(await screen.findByTestId("fimport-row-2")).toHaveTextContent("unit_price_php: 11.2 → 12");
  expect(screen.getByTestId("fimport-counts")).toHaveTextContent("1 errors");
  expect(screen.getByTestId("fimport-error-row")).toHaveTextContent("Row 4, form");
  expect(screen.getByTestId("fimport-warning-row")).toHaveTextContent("RxNorm");
  expect(screen.getByTestId("fimport-apply")).toBeDisabled();
  expect(api.post.mock.calls[0][1].get("mode")).toBe("preview");
  api.post.mockResolvedValue({ data: { ...plan, ok: true, errors: [] } });
  fireEvent.click(screen.getByTestId("fimport-preview"));
  await waitFor(() => expect(screen.getByTestId("fimport-apply")).not.toBeDisabled());
  api.post.mockResolvedValue({ data: { ...plan, ok: true, errors: [] } });
  fireEvent.click(screen.getByTestId("fimport-apply"));
  await waitFor(() => expect(onApplied).toHaveBeenCalled());
  expect(api.post.mock.calls[2][1].get("mode")).toBe("apply");
});

test("a system administrator chooses the POWER formulary reviewers; clinics don't see the button", async () => {
  const PEOPLE = { results: [{ id: 4, name: "Bonifacio, Andres", clinic: "Klinika ng Bayan", reviewer: false }], log: [] };
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/f/reviewers/" ? PEOPLE : { ...META, edits_shared: true, results: [MORPHINE] } }));
  api.patch.mockResolvedValue({ data: { results: [{ ...PEOPLE.results[0], reviewer: true }], log: [{ id: 1, at: "2026-11-21T09:00:00Z", pharmacist: "Bonifacio, Andres", by: "Admin, POWER", granted: true }], changed: true } });
  const { unmount } = render(<FormularyPanel />);
  fireEvent.click(await screen.findByTestId("formulary-reviewers"));
  fireEvent.click(await screen.findByTestId("reviewer-4"));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/f/reviewers/4/", { reviewer: true }, expect.anything()));
  expect(await screen.findByTestId("reviewers-log")).toHaveTextContent("Admin, POWER made Bonifacio, Andres a reviewer");
  expect(screen.getByTestId("reviewer-4")).toBeChecked();
  unmount();
  api.get.mockResolvedValue({ data: { ...META, results: [AMOX] } });
  render(<FormularyPanel />);
  await screen.findByTestId("formulary-row-amoxicillin_500_capsule");
  expect(screen.queryByTestId("formulary-reviewers")).toBeNull();
});
