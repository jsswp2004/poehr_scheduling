import { landingPath, postLoginPath, solutionsFor } from './landing';

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

describe('postLoginPath', () => {
  test('patients keep their dashboard', () => {
    expect(postLoginPath('patient', null)).toBe('/dashboard');
  });
  test('administrators land on Solutions, where Management Portal is the first tile', () => {
    expect(postLoginPath('admin', ['staffing'])).toBe('/solutions');
    expect(postLoginPath('system_admin', null)).toBe('/solutions');
    expect(postLoginPath('admin', [])).toBe('/admin'); // nothing but the portal: straight in
    expect(solutionsFor('admin', ['staffing']).map((t) => t.key)).toEqual(['management', 'staffing']);
    expect(solutionsFor('nurse', null).map((t) => t.key)).not.toContain('management');
  });
  test('several solutions: the Solutions page; exactly one: straight in; none: dashboard', () => {
    expect(postLoginPath('nurse', null)).toBe('/solutions');
    expect(postLoginPath('nurse', ['staffing'])).toBe('/staffing');
    expect(postLoginPath('staff', ['staffing'])).toBe('/staffing');
    expect(postLoginPath('staff', ['scheduling'])).toBe('/dashboard');
    expect(postLoginPath('registrar', ['staffing', 'communicator'])).toBe('/solutions');
  });
  test('each role sees only its own tiles', () => {
    const keys = (role, mods) => solutionsFor(role, mods).map((t) => t.key);
    expect(keys('registrar', null)).toEqual(['notes', 'scheduler', 'communicator', 'staffing', 'telehealth']);
    expect(keys('nurse', null)).toEqual(['notes', 'scheduler', 'staffing', 'telehealth', 'dictate']);
    expect(keys('receptionist', null)).toEqual(['notes', 'telehealth']);
    expect(keys('nurse', ['dictation'])).toEqual(['dictate']);
  });
});
