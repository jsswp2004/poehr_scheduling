import React from 'react';
import { PatientJoinPage } from '../telehealth';

// Public page opened from the text message. No login, no staff navigation: the link's token
// (in the URL fragment) is the only credential.
function TelehealthJoinPage() {
  return <PatientJoinPage />;
}

export default TelehealthJoinPage;
