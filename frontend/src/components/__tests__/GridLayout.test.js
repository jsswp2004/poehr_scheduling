import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { Grid } from "@mui/material";
import SubscriptionTierSelector from "../SubscriptionTierSelector";

// MUI 7's Grid sizes its columns from `size`; the old `item xs sm md` props are silently ignored.
const widthOf = (el) => getComputedStyle(el).width || getComputedStyle(el).flexBasis || "";

test("the size prop gives a Grid child a column width, the old item/xs props do not", () => {
  const warn = jest.spyOn(console, "warn").mockImplementation(() => {}); // MUI warns about the removed props, which is the point
  render(
    <Grid container>
      <Grid size={6} data-testid="new" />
      <Grid item xs={6} data-testid="old" />
    </Grid>
  );
  expect(widthOf(screen.getByTestId("new"))).toMatch(/calc\(100% \* 6/);
  expect(widthOf(screen.getByTestId("old"))).not.toMatch(/calc\(100% \* 6/);
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});

test("a screen converted to the new syntax lays its columns out", () => {
  render(<SubscriptionTierSelector selectedTier="basic" onTierSelect={() => {}} />);
  const card = screen.getByText("Professional").closest("[class*='MuiGrid']");
  expect(widthOf(card)).toMatch(/calc\(100% \* /);
});

const LEGACY = /<Grid\b[^<>]*?\s(?:item|xs|sm|md|lg|xl)(?=[\s=/>])/;
const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (/\.jsx?$/.test(e.name) && !/\.(test|spec)\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
};

test("no screen still uses the old Grid item/xs/sm/md props", () => {
  const src = path.resolve(__dirname, "..", "..");
  const offenders = walk(src).filter((f) => LEGACY.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(src, f));
  expect(offenders).toEqual([]);
});
