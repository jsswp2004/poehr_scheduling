import React from 'react';
import { jwtDecode } from 'jwt-decode';
import { TelehealthApp } from '../telehealth';

// Mirrors the server's default rights (users/rights.py). The server makes the real decision on
// every call, so a mismatch here can only hide or show a button, never grant access.
const CONDUCT_ROLES = ['doctor', 'nurse'];
const MANAGE_ROLES = ['receptionist', 'registrar', 'admin', 'system_admin'];

function currentRole() {
  try {
    return jwtDecode(localStorage.getItem('access_token')).role || '';
  } catch (err) {
    return '';
  }
}

// The assistant stays off until the server has a model configured (TELEHEALTH_ASSISTANT_BACKEND)
// and this flag is turned on for the build.
const ASSISTANT_ON = process.env.REACT_APP_TELEHEALTH_ASSISTANT === 'true';

function TelehealthPage() {
  const role = currentRole();
  return (
    <TelehealthApp
      canConduct={CONDUCT_ROLES.includes(role)}
      canManage={MANAGE_ROLES.includes(role)}
      assistant={ASSISTANT_ON}
    />
  );
}

export default TelehealthPage;
