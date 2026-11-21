import { render, screen, fireEvent, within } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({
  apiEndpoints: {
    orderablesAdmin: "/admin/orderables/",
    orderableAdmin: (id) => `/admin/orderables/${id}/`,
    noteTemplatesAdmin: "/admin/note-templates/",
    orderablesUploadCsv: "/admin/orderables/upload-csv/",
    orderablesSampleCsv: "/admin/orderables/sample-csv/",
    orderablesDownloadCsv: "/admin/orderables/download-csv/",
  },
}), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: async () => "t" }), { virtual: true });
jest.mock("react-router-dom", () => ({ useNavigate: () => jest.fn(), useLocation: () => ({ pathname: "/order-builder" }) }), { virtual: true });
jest.mock("jwt-decode", () => ({ jwtDecode: () => ({ role: "admin", user_id: 1 }) }), { virtual: true });

import { api } from "../../api/client";
import OrderablesManager from "../orderBuilder/OrderablesManager";

test("the Order Builder points medications to the Formulary and does not offer the Medication category", async () => {
  api.get.mockImplementation((url) => Promise.resolve({ data: url === "/admin/orderables/" ? [{ id: 1, code: "cbc", name: "CBC", category: "laboratory", is_active: true, organization: 2 }] : [] }));
  render(<OrderablesManager />);
  expect(await screen.findByTestId("ob-medications-note")).toHaveTextContent("Medications are managed in Pharmacy > Formulary");
  await screen.findByText("CBC");
  const comboboxes = screen.getAllByRole("combobox");
  fireEvent.mouseDown(comboboxes[0]);
  const options = within(await screen.findByRole("listbox")).getAllByRole("option").map((o) => o.textContent);
  expect(options).not.toContain("Medication");
  expect(options).toContain("Laboratory");
});
