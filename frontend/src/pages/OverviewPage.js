import '../OverviewPage/OverviewPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import OverviewImage from '../assets/dashboard_features2.png';

export const OverviewPage = ({ className }) => {
  return (
    <div className={`overview-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Application Overview</h1>
        <p className="page-subtitle">Learn how POWER simplifies clinic scheduling.</p>
      </div>
      <div className="image-placeholder">
        <img
          src={OverviewImage}
          alt="Application Overview"
          className="overview-image"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            borderRadius: '0px',
            padding: '0px',
          }}
        />
      </div>
      <div className="features-section">
        <div className="feature-panels">
          <div className="feature-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="panel-features">
              <p className="overview-text">
                POWER IT is a healthcare scheduling system built with a Django backend and React frontend. Clinics can
                upload events, holidays, staff lists and provider lists directly from the app, manage availability and
                block times, and send automated text and email reminders. Notifications keep both organization and
                system administrators informed whenever patients register or appointments are created, ensuring seamless
                collaboration across the team.
              </p>
            </div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default OverviewPage;
