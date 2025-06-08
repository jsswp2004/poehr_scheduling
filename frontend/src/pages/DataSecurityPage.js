import '../DataSecurityPage/DataSecurityPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

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
          <h2 className="section-heading">End-to-End Encryption</h2>
          <p className="section-text">
            All communications between your browser and our servers are protected with industry standard encryption. Patient information and clinic data remain confidential while in transit and at rest.
          </p>
        </div>
        <div className="image-placeholder" />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Local Storage Options</h2>
          <p className="section-text">
            POWER can store your data locally on clinic infrastructure when required, ensuring you maintain complete ownership and control over every record.
          </p>
        </div>
        <div className="image-placeholder" />
      </div>
      <div className="security-details">
        <div className="text-block">
          <h2 className="section-heading">Full Data Ownership</h2>
          <p className="section-text">
            Your data is never shared with third parties. You decide when and how to export or remove it, supporting strict HIPAA compliance and privacy requirements.
          </p>
        </div>
        <div className="image-placeholder" />
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default DataSecurityPage;
