import { landingPath } from './landing';

describe('landingPath', () => {
  test('administrators keep the Management Portal', () => {
    expect(landingPath('admin', ['staffing'])).toBe('/admin');
    expect(landingPath('system_admin', null)).toBe('/admin');
  });
  test('clinical documentation first, then scheduling, then staffing', () => {
    expect(landingPath('doctor', ['staffing', 'clinical_documentation'])).toBe('/patients');
    expect(landingPath('nurse', ['scheduling', 'staffing'])).toBe('/patients?tab=appointments');
    expect(landingPath('registrar', ['staffing'])).toBe('/staffing');
  });
  test('staff logins and unconfigured organizations', () => {
    expect(landingPath('staff', ['staffing'])).toBe('/staffing');
    expect(landingPath('staff', ['scheduling'])).toBe('/dashboard');
    expect(landingPath('doctor', null)).toBe('/patients');
    expect(landingPath('patient', ['staffing'])).toBe('/dashboard');
  });
});
