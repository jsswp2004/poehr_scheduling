import { render, screen } from "@testing-library/react";

jest.mock("../patients/ChartPageShell", () => ({ children }) => <div data-testid="shell">{children}</div>, { virtual: true });
jest.mock("../prescriptions/PrescriptionWorklist", () => () => <div data-testid="rx-list">LIST</div>, { virtual: true });
jest.mock("../referrals/useMe", () => () => ({ role: "doctor", id: 5 }), { virtual: true });

import PrescriptionManagerPage from "../../pages/PrescriptionManagerPage";

test("the Prescription Manager sits inside the side bar shell with no padding above the banner", () => {
  render(<PrescriptionManagerPage />);
  expect(screen.getByTestId("shell")).toContainElement(screen.getByTestId("rx-list"));
  const page = getComputedStyle(screen.getByTestId("rx-manager-page"));
  expect(page.paddingTop).toBe("");
  expect(page.paddingLeft).toBe("");
  expect(page.paddingBottom).toBe("4px");
});
