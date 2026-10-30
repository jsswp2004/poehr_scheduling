import '../DataSecurityPage/DataSecurityPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import encryptionImage from '../assets/Encryption.png';
import dataOwnershipImage from '../assets/DataOwnership.png';
import cloudProtectionImage from '../assets/CloudProtection.png';

export const DataSecurityPage = ({ className }) => {
  return (
    <div className={`data-security-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Data Security & Privacy</h1>
        <p className="page-subtitle">How POWER protects your information</p>
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Encryption and Access Control</h2>
          <p className="section-text">
            Traffic between your browser and POWER is encrypted with HTTPS. Your database is encrypted at rest by our hosting provider. Each organization's data is kept separate from every other organization's, and what each person can see and do depends on their role and the rights your administrator gives them.
          </p>
          <div className="security-features">
            <span className="feature-badge">🔐 Encrypted in transit and at rest</span>
            <span className="feature-badge">🛡️ Role-based access</span>
            <span className="feature-badge">⚕️ Built with HIPAA safeguards in mind</span>
          </div>
        </div>
        <img
          src={encryptionImage}
          alt="Encryption and access control"
          className="security-image encryption-image"
        />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Cloud Hosting</h2>
          <p className="section-text">
            POWER runs on Render, which hosts the application and database, and Vercel, which serves the web app. Your data is stored in the United States.
          </p>
          <p className="section-text">
            <strong>You own your data:</strong> Your administrator can export your organization's data from the Account page, and you can close your account yourself. No vendor lock-in and no hidden fees.
          </p>
          <div className="security-features">
            <span className="feature-badge">☁️ Hosted on Render and Vercel</span>
            <span className="feature-badge">🇺🇸 Data stored in the United States</span>
          </div>
        </div>
        <img
          src={cloudProtectionImage}
          alt="Cloud hosting"
          className="security-image cloud-image"
        />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Data Ownership and Control</h2>
          <p className="section-text">
            Your data belongs to you. We do not sell your patient information, and we use it only to provide our services. You can export your organization's data in standard formats at any time.
          </p>
          <p className="section-text">
            <strong>Your controls include:</strong> data export from your account page, audit history on key actions such as orders, lab results, prescriptions, referrals, messaging and staffing changes, and the ability to close your account or delete your organization. Healthcare records can be subject to retention rules, so please contact us before deleting records you may need to keep.
          </p>
          <div className="security-features">
            <span className="feature-badge">📋 Audit history on key actions</span>
            <span className="feature-badge">📤 Data export</span>
            <span className="feature-badge">🗑️ Close your account or delete your organization</span>
          </div>
        </div>
        <img
          src={dataOwnershipImage}
          alt="Complete data ownership and control features"
          className="security-image ownership-image"
        />
      </div>

      <div className="security-contact-section">
        <div className="contact-content">
          <h2 className="section-heading">Security & Compliance</h2>
          <p className="section-text">
            Have questions about our security practices? Email us and we will answer them. If your organization needs a business associate agreement, ask us before you start storing patient information in POWER.
          </p>
          <div className="compliance-badges">
            <div className="badge-item">
              <div className="badge-icon">⚕️</div>
              <span>Built with HIPAA safeguards in mind</span>
            </div>
            <div className="badge-item">
              <div className="badge-icon">☁️</div>
              <span>Hosted on Render and Vercel</span>
            </div>
          </div>
          <div className="contact-info">
            <p><strong>Email Team:</strong> power@powerhealthit.com</p>
            {/*<p><strong>Compliance Inquiries:</strong> compliance@powerehrsolutions.com</p>*/}
            <p><strong>Data requests:</strong> From your account page</p>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default DataSecurityPage;
