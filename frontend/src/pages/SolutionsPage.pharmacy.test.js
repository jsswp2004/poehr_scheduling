import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SolutionsPage from './SolutionsPage';
import { landingPath, postLoginPath, solutionsFor } from '../utils/landing';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });

// A token the page can decode: header.payload.signature with a JSON payload.
const signIn = (payload) => {
  const body = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload }));
  localStorage.setItem('access_token', `x.${body}.y`);
};

beforeEach(() => {
  mockNavigate.mockClear();
  localStorage.clear();
});

test('an administrator sees the POWER Pharmacy tile after POWER MDS and it opens the Pharmacy care setting', () => {
  signIn({ role: 'admin', modules: ['clinical_documentation', 'mds', 'pharmacy'] });
  render(<SolutionsPage />);
  expect(solutionsFor('admin', ['clinical_documentation', 'mds', 'pharmacy']).map((t) => t.key).slice(-2)).toEqual(['mds', 'pharmacy']);
  fireEvent.click(screen.getByText('POWER Pharmacy'));
  expect(mockNavigate).toHaveBeenCalledWith('/patients?care=pharmacy');
});

test('the tile needs the module and a pharmacy role', () => {
  expect(solutionsFor('admin', ['clinical_documentation']).map((t) => t.key)).not.toContain('pharmacy');
  expect(solutionsFor('doctor', null).map((t) => t.key)).not.toContain('pharmacy');
  expect(solutionsFor('pharmacy_tech', ['pharmacy']).map((t) => t.key)).toEqual(['pharmacy']);
});

test('a pharmacist goes straight into Pharmacy after signing in', () => {
  expect(postLoginPath('pharmacist', ['clinical_documentation', 'pharmacy'])).toBe('/patients?care=pharmacy');
  expect(landingPath('pharmacist', ['pharmacy'])).toBe('/patients?care=pharmacy');
  expect(landingPath('pharmacist', ['staffing'])).toBe('/dashboard');
});

test('POWER Labs: a tile for clinicians and administrators with POWER Notes, opening /labs', () => {
  expect(solutionsFor('doctor', ['clinical_documentation']).map((t) => t.key)).toEqual(['notes', 'labs']);
  expect(solutionsFor('registrar', ['clinical_documentation']).map((t) => t.key)).not.toContain('labs');
  expect(solutionsFor('doctor', ['staffing']).map((t) => t.key)).not.toContain('labs');
  signIn({ role: 'doctor', modules: ['clinical_documentation'] });
  render(<SolutionsPage />);
  fireEvent.click(screen.getByText('POWER Labs'));
  expect(mockNavigate).toHaveBeenCalledWith('/labs');
});

test('POWER Labs is a companion tile: a Notes-only clinician still goes straight into Notes', () => {
  expect(postLoginPath('doctor', ['clinical_documentation'])).toBe('/patients');
  expect(postLoginPath('ext_lab_tech', [])).toBe('/lab-portal');
});
