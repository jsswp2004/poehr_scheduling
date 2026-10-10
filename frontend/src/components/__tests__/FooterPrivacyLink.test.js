import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
jest.mock("../../assets/POWER_IT.png", () => "logo.png", { virtual: true });
import { Footer } from "../Footer";

test("the footer links to the Privacy Policy page, labelled just Privacy", () => {
  render(
    <MemoryRouter>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </MemoryRouter>
  );
  const link = screen.getByRole("link", { name: "Privacy" });
  expect(link.getAttribute("href")).toBe("/privacy");
  expect(screen.queryByText(/Terms\s*&\s*Privacy/)).toBeNull();
});
