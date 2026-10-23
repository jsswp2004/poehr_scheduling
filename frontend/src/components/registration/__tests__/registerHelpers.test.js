import {
  formatDobInput,
  formatPhone,
  isPossibleMatch,
  makePassword,
  makeUsername,
  mapServerErrors,
  parseDob,
  passwordStrength,
  patientSearchParams,
  showDob,
  validatePublic,
  validateStaff,
  visitStatus,
} from "../registerHelpers";

const TODAY = new Date(2026, 9, 22);

describe("dates", () => {
  test("typing digits adds the slashes", () => {
    expect(formatDobInput("03141972")).toBe("03/14/1972");
    expect(formatDobInput("0314")).toBe("03/14");
    expect(formatDobInput("03/14/19x72")).toBe("03/14/1972");
  });
  test("parseDob accepts real dates in the past only", () => {
    expect(parseDob("03/14/1972", TODAY)).toBe("1972-03-14");
    expect(parseDob("1972-03-14", TODAY)).toBe("1972-03-14");
    expect(parseDob("2/30/1990", TODAY)).toBeNull();
    expect(parseDob("13/01/1990", TODAY)).toBeNull();
    expect(parseDob("01/01/1850", TODAY)).toBeNull();
    expect(parseDob("10/23/2026", TODAY)).toBeNull();
    expect(parseDob("10/22/2026", TODAY)).toBe("2026-10-22");
    expect(parseDob("", TODAY)).toBeNull();
  });
  test("showDob", () => {
    expect(showDob("1972-03-14")).toBe("03/14/1972");
    expect(showDob(null)).toBe("--");
  });
});

describe("phone", () => {
  test("formats as typed", () => {
    expect(formatPhone("3015550142")).toBe("(301) 555-0142");
    expect(formatPhone("30155")).toBe("(301) 55");
    expect(formatPhone("301555014299")).toBe("(301) 555-0142");
  });
});

describe("generated logins", () => {
  test("username is lowercase letters and digits", () => {
    expect(makeUsername("Taylor", "Whitfield", () => 0.5)).toBe("twhitfield5500");
    expect(makeUsername("Zoë", "O'Brien-Smith", () => 0)).toBe("zobriensmith1000");
    expect(makeUsername("", "", () => 0)).toBe("patient1000");
  });
  test("password is long and varies", () => {
    const a = makePassword();
    const b = makePassword();
    expect(a).toHaveLength(16);
    expect(a).not.toBe(b);
  });
  test("password still works without crypto", () => {
    expect(makePassword(12, null)).toHaveLength(12);
  });
  test("strength", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("abc")).toBe(1);
    expect(passwordStrength("abcdef")).toBe(1);
    expect(passwordStrength("abcdefghij")).toBe(2);
    expect(passwordStrength("Abcdefghi1")).toBe(3);
  });
});

describe("staff validation", () => {
  const good = { first_name: "Taylor", last_name: "Whitfield", dob: "03/14/1972", legal_sex: "M", email: "t@example.com", phone_number: "3015550142" };
  test("a complete form has no errors", () => {
    expect(validateStaff(good)).toEqual({});
  });
  test("missing fields are named", () => {
    const e = validateStaff({});
    expect(Object.keys(e).sort()).toEqual(["dob", "email", "first_name", "last_name", "legal_sex"]);
  });
  test("phone is optional but must be complete", () => {
    expect(validateStaff({ ...good, phone_number: "" })).toEqual({});
    expect(validateStaff({ ...good, phone_number: "301555" }).phone_number).toBeTruthy();
  });
  test("bad email and bad date", () => {
    expect(validateStaff({ ...good, email: "taylor@" }).email).toMatch(/full email/);
    expect(validateStaff({ ...good, dob: "13/45/1972" }).dob).toMatch(/MM\/DD\/YYYY/);
  });
  test("portal login needs a username and password", () => {
    const e = validateStaff({ ...good, username: "ab", password: "12345" }, { portalLogin: true });
    expect(e.username).toBeTruthy();
    expect(e.password).toBeTruthy();
    expect(validateStaff({ ...good, username: "abc", password: "123456" }, { portalLogin: true })).toEqual({});
  });
});

describe("public validation", () => {
  const good = { first_name: "A", last_name: "B", email: "a@b.co", password: "secret1", phone_number: "", has_provider: "yes" };
  test("valid", () => expect(validatePublic(good)).toEqual({}));
  test("the clinic name only when asked for", () => {
    expect(validatePublic(good, { needsOrganization: true }).organization_name).toBeTruthy();
    expect(validatePublic({ ...good, organization_name: "Clinic" }, { needsOrganization: true })).toEqual({});
  });
  test("no provider means a phone number is needed", () => {
    expect(validatePublic({ ...good, has_provider: "no" }).phone_number).toBeTruthy();
    expect(validatePublic({ ...good, has_provider: "no", phone_number: "3015550142" })).toEqual({});
  });
  test("the provider question is optional", () => {
    expect(validatePublic({ ...good, has_provider: null })).toEqual({});
  });
});

describe("server errors", () => {
  test("maps fields and renames", () => {
    expect(mapServerErrors({ email: ["Enter a valid email."], username: ["taken"] }, { username: "email" })).toEqual({ email: "Enter a valid email. taken" });
  });
  test("unknown fields and detail go to _form", () => {
    expect(mapServerErrors({ detail: "Not allowed." })).toEqual({ _form: "Not allowed." });
    expect(mapServerErrors({ provider: ["Bad id."] })).toEqual({ _form: "provider: Bad id." });
  });
  test("nothing", () => {
    expect(mapServerErrors(null)).toEqual({});
  });
});

describe("duplicates and visit status", () => {
  test("possible match needs the same last name and a similar first name", () => {
    expect(isPossibleMatch({ first_name: "Taylor", last_name: "Whitfield" }, "Taylor", "whitfield")).toBe(true);
    expect(isPossibleMatch({ first_name: "Tay", last_name: "Whitfield" }, "Taylor", "Whitfield")).toBe(true);
    expect(isPossibleMatch({ first_name: "Maria", last_name: "Whitfield" }, "Taylor", "Whitfield")).toBe(false);
    expect(isPossibleMatch({ first_name: "Taylor", last_name: "Smith" }, "Taylor", "Whitfield")).toBe(false);
    expect(isPossibleMatch({}, "Taylor", "Whitfield")).toBe(false);
  });
  test("visit status", () => {
    expect(visitStatus({ current_visit: { care_setting: "emergency", discharge_datetime: null, visit_number: "V1" } })).toEqual({ open: true, label: "ED", detail: "V1" });
    expect(visitStatus({ current_visit: { care_setting: "acute", discharge_datetime: "2026-10-01T10:00:00Z" } }).open).toBe(false);
    expect(visitStatus({ current_visit: null })).toEqual({ open: false, label: "No open visit", detail: "" });
  });
});

describe("table search text", () => {
  test("name, date of birth, phone, MRN digits", () => {
    expect(patientSearchParams("")).toEqual({});
    expect(patientSearchParams("Whitfield")).toEqual({ search: "Whitfield" });
    expect(patientSearchParams("03/14/1972")).toEqual({ dob: "1972-03-14" });
    expect(patientSearchParams("(301) 555-0142")).toEqual({ search: "3015550142" });
    expect(patientSearchParams("MRN-000123")).toEqual({ search: "MRN-000123" });
    expect(patientSearchParams("12")).toEqual({ search: "12" });
  });
});

describe("age and filled steps", () => {
  const { ageText, stepFilled } = require("../registerHelpers");
  const today = new Date(2026, 9, 22);
  test("ageText", () => {
    expect(ageText("1972-03-14", today)).toBe("54 y");
    expect(ageText("1972-10-23", today)).toBe("53 y");
    expect(ageText("2025-10-22", today)).toBe("12 mo");
    expect(ageText("2026-07-22", today)).toBe("3 mo");
    expect(ageText("2026-10-12", today)).toBe("10 d");
    expect(ageText("2027-01-01", today)).toBe("");
    expect(ageText("", today)).toBe("");
  });
  test("stepFilled needs every key detail", () => {
    expect(stepFilled("identity", { legal_sex: "F", date_of_birth: "1972-03-14", phone_number: "3015550142" })).toBe(true);
    expect(stepFilled("identity", { legal_sex: "F", date_of_birth: "1972-03-14" })).toBe(false);
    expect(stepFilled("legal", { consent_to_treat: true })).toBe(true);
    expect(stepFilled("legal", { consent_to_treat: false })).toBe(false);
    expect(stepFilled("reason", {}, { reason_for_visit: "Chest pain" })).toBe(true);
    expect(stepFilled("logistics", {}, { care_setting: "emergency", attending_provider: "" })).toBe(false);
    expect(stepFilled("nope")).toBe(false);
  });
});
