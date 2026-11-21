jest.mock("axios", () => ({ get: jest.fn() }));
jest.mock("../../utils/tokenManager", () => ({ getAccessToken: () => "t" }), { virtual: true });
jest.mock("../../utils/orgModules", () => ({ moduleEnabled: () => true }), { virtual: true });

import { readOpenFills } from "../../hooks/useWorklistCounts";

test("the Outpatient Rx badge counts every in-house fill not yet dispensed", () => {
  const counts = { received: 2, data_entry: 1, filling: 0, final_check: 1, ready: 3, dispensed: 40, on_hold: 1 };
  expect(readOpenFills({ counts })).toEqual({ count: 8, overdue: 0 });
  expect(readOpenFills(null)).toEqual({ count: 0, overdue: 0 });
});
