import { useState } from 'react';
import MaintenancePage from './MaintenancePage'; // Import your existing maintenance page
import EnvironmentProfilePage from './EnvironmentProfilePage'; // Create this component as step 2
import { Button } from 'react-bootstrap';

function SettingsPage() {
  const [view, setView] = useState(''); // '' | 'maintenance' | 'env'

  return (
    <div className="container mt-5">
      <h2 className="fw-bold mb-4">Settings</h2>
      <div className="mb-4 d-flex gap-3">
        <Button variant="primary" onClick={() => setView('maintenance')}>
          Schedule Maintenance
        </Button>
        <Button variant="secondary" onClick={() => setView('env')}>
          Environment Profile
        </Button>

        
      </div>
      <div>
        {view === 'maintenance' && <MaintenancePage />}
        {view === 'env' && <EnvironmentProfilePage />}
        {!view && (
          <div className="text-muted">Select an option above to begin.</div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
