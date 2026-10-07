import { render, waitFor } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn() } }), { virtual: true });
jest.mock("../../config/api", () => ({ apiEndpoints: { patientHeader: (id) => `/h/${id}` } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: () => Promise.resolve("t") }), { virtual: true });
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });

import { api } from "../../api/client";
import PatientChartHeader from "../patientHeader/PatientChartHeader";

test("the header tells the page which visit it is showing, and clears it when the patient changes", async () => {
  api.get.mockResolvedValue({ data: { patient: 7, visit: 12, appointment: 99, items: [], allergies: { records: [] }, custom_fields: [] } });
  const onLoaded = jest.fn();
  const { rerender } = render(<PatientChartHeader persistent patientId={7} onLoaded={onLoaded} />);
  await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(expect.objectContaining({ visit: 12, appointment: 99 })));
  rerender(<PatientChartHeader persistent patientId={8} onLoaded={onLoaded} />);
  await waitFor(() => expect(onLoaded).toHaveBeenCalledWith(null));
});
