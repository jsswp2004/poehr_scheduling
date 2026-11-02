import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SolutionsPage from './SolutionsPage';
import { postLoginPath, landingPath, solutionsFor } from '../utils/landing';
import { moduleEnabled } from '../utils/orgModules';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

const signIn = (payload) => {
  const body = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload }));
  localStorage.setItem('access_token', `x.${body}.y`);
};

beforeEach(() => {
  mockNavigate.mockClear();
  localStorage.clear();
});

test('a registrar at a Registration-only clinic goes straight into the Registration workspace', () => {
  expect(postLoginPath('registrar', ['registration'])).toBe('/registration');
  expect(landingPath('registrar', ['registration'])).toBe('/registration');
});

test('the Registration tile opens /registration', () => {
  signIn({ role: 'registrar', modules: ['registration', 'staffing'] });
  render(<SolutionsPage />);
  fireEvent.click(screen.getByText('POWER Registration'));
  expect(mockNavigate).toHaveBeenCalledWith('/registration');
});

test('Clinical Notes and the Patient Portal include Registration', () => {
  expect(solutionsFor('registrar', ['clinical_documentation']).map((t) => t.key)).toContain('registration');
  expect(moduleEnabled('registration', ['patient_portal'])).toBe(true);
  expect(moduleEnabled('registration', ['staffing'])).toBe(false);
});

test('doctors and nurses do not get the Registration tile', () => {
  expect(solutionsFor('nurse', null).map((t) => t.key)).not.toContain('registration');
});
