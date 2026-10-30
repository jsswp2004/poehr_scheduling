import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SolutionsPage from './SolutionsPage';

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

test('someone who is not signed in is sent to the login page', () => {
  render(<SolutionsPage />);
  expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
});

test('a nurse at a full clinic sees the clinical solutions and opens one directly', () => {
  signIn({ role: 'nurse', modules: null });
  render(<SolutionsPage />);
  ['POWER Notes', 'POWER Scheduler', 'POWER Staffing', 'POWER Telehealth', 'POWER Dictate'].forEach((name) =>
    expect(screen.getByText(name)).toBeInTheDocument()
  );
  expect(screen.queryByText('POWER Communicator')).toBeNull();
  expect(screen.queryByText('POWER Patient Portal')).toBeNull();
  fireEvent.click(screen.getByText('POWER Telehealth'));
  expect(mockNavigate).toHaveBeenCalledWith('/telehealth');
});

test('only the services the organization has are shown', () => {
  signIn({ role: 'registrar', modules: ['staffing', 'communicator'] });
  render(<SolutionsPage />);
  expect(screen.getByText('POWER Staffing')).toBeInTheDocument();
  expect(screen.getByText('POWER Communicator')).toBeInTheDocument();
  expect(screen.queryByText('POWER Notes')).toBeNull();
  expect(screen.queryByText('POWER Telehealth')).toBeNull();
});

test('an administrator sees the Management Portal first and it opens the portal', () => {
  signIn({ role: 'admin', modules: ['staffing'] });
  render(<SolutionsPage />);
  expect(screen.getByText('Management Portal')).toBeInTheDocument();
  expect(screen.getByText('POWER Staffing')).toBeInTheDocument();
  expect(screen.queryByText('POWER Notes')).toBeNull();
  fireEvent.click(screen.getByText('Management Portal'));
  expect(mockNavigate).toHaveBeenCalledWith('/admin');
});

test('nobody but an administrator sees the Management Portal', () => {
  signIn({ role: 'nurse', modules: null });
  render(<SolutionsPage />);
  expect(screen.queryByText('Management Portal')).toBeNull();
});
