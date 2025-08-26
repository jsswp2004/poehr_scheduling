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
          <h2 className="section-heading">Enterprise-Grade End-to-End Encryption</h2>
          <p className="section-text">
            Powered by Microsoft Azure's enterprise-grade security infrastructure, all data is protected with AES-256 encryption and TLS 1.3 protocols. Your patient information and clinic data are secured with the same encryption standards used by Fortune 500 companies, ensuring confidentiality in transit, at rest, and during processing. Azure Key Vault manages all encryption keys with hardware security modules (HSMs) for maximum protection.
          </p>
          <div className="security-features">
            <span className="feature-badge">🔐 AES-256 Encryption</span>
            <span className="feature-badge">🛡️ Azure Key Vault</span>
            <span className="feature-badge">✅ SOC 2 Certified</span>
            <span className="feature-badge">⚕️ HIPAA Compliant</span>
          </div>
        </div>
        <img 
          src={encryptionImage} 
          alt="Enterprise-grade encryption security infrastructure" 
          className="security-image encryption-image" 
        />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Azure Cloud-Powered Data Protection</h2>
          <p className="section-text">
            POWER applications run on Microsoft Azure's global cloud infrastructure, providing unparalleled security, reliability, and performance. Your data is protected across multiple Azure data centers with automatic backup, disaster recovery, and 99.99% uptime guarantee. With Azure's global network, your clinic data is always accessible, secure, and protected by enterprise-grade infrastructure trusted by healthcare organizations worldwide.
          </p>
          <p className="section-text">
            <strong>Complete Data Ownership:</strong> While leveraging Azure's powerful infrastructure, you maintain 100% ownership of your data. Request to download your complete data archive in standard formats (JSON, CSV, PDF) or delete all records at your convenience through our self-service portal. No vendor lock-in, no hidden fees - your data, your control.
          </p>
          <div className="security-features">
            <span className="feature-badge">☁️ Azure Global Infrastructure</span>
            <span className="feature-badge">📊 99.99% Uptime SLA</span>
            <span className="feature-badge">🔄 Auto Backup & Recovery</span>
            <span className="feature-badge">🌍 Multi-Region Protection</span>
          </div>
        </div>
        <img 
          src={cloudProtectionImage} 
          alt="Azure cloud-powered data protection infrastructure" 
          className="security-image cloud-image" 
        />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Complete Data Ownership & Control</h2>
          <p className="section-text">
            Your data belongs to you, period. POWER ensures absolute data ownership with full transparency and control. We never share, sell, or access your patient information for any purpose other than providing our services. You have the unrestricted right to export all your data in industry-standard formats or request immediate deletion of all records.
          </p>
          <p className="section-text">
            <strong>Your Rights Include:</strong> Instant data export in multiple formats, complete audit logs of all data access, immediate data deletion upon request, and seamless data migration support. Our commitment extends beyond HIPAA compliance to include GDPR and CCPA requirements, ensuring your practice meets all privacy regulations.
          </p>
          <div className="security-features">
            <span className="feature-badge">📋 Complete Audit Trails</span>
            <span className="feature-badge">📤 Instant Data Export</span>
            <span className="feature-badge">🗑️ Right to Deletion</span>
            <span className="feature-badge">⚖️ GDPR & CCPA Compliant</span>
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
            Have questions about our security practices? Our dedicated security team is here to help. We conduct regular security assessments, penetration testing, and compliance audits to ensure your data remains protected.
          </p>
          <div className="compliance-badges">
            <div className="badge-item">
              <div className="badge-icon">🛡️</div>
              <span>SOC 2 Type II</span>
            </div>
            <div className="badge-item">
              <div className="badge-icon">⚕️</div>
              <span>HIPAA Compliant</span>
            </div>
            <div className="badge-item">
              <div className="badge-icon">🔒</div>
              <span>ISO 27001</span>
            </div>
            <div className="badge-item">
              <div className="badge-icon">☁️</div>
              <span>Azure Certified</span>
            </div>
          </div>
          <div className="contact-info">
            {/*<p><strong>Security Team:</strong> security@powerehrsolutions.com</p>
            <p><strong>Compliance Inquiries:</strong> compliance@powerehrsolutions.com</p>*/}
            <p><strong>Data Requests:</strong> Available 24/7 through your account dashboard</p>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default DataSecurityPage;
