import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SolutionsPage from './SolutionsPage';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../components/Header', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/Footer', () => ({ __esModule: true, default: () => null }));

beforeEach(() => mockNavigate.mockClear());

test('the Telehealth button signs in and then goes to Telehealth', () => {
  render(<SolutionsPage />);
  fireEvent.click(screen.getByText('POWER Telehealth'));
  expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=telehealth');
});

test('the Dictate button signs in and then goes to Dictate', () => {
  render(<SolutionsPage />);
  fireEvent.click(screen.getByText('POWER Dictate'));
  expect(mockNavigate).toHaveBeenCalledWith('/login?redirect=dictate');
});

test('the other solution buttons are still there', () => {
  render(<SolutionsPage />);
  ['POWER Scheduler', 'POWER Communicator', 'POWER Staffing'].forEach((name) =>
    expect(screen.getByText(name)).toBeInTheDocument()
  );
});
