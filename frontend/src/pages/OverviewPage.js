import '../OverviewPage/OverviewPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import OverviewImage from '../assets/dashboard_overview.png'; // Or use dashboard_features2.png if you prefer

export const OverviewPage = ({ className }) => {
  return (
    <div className={`overview-page ${className || ''}`}>
      <Header />

      <div className="page-title-section">
        <h1 className="page-title">Application Overview</h1>
        <p className="page-subtitle">Learn how POWER simplifies clinic scheduling.</p>
      </div>

      <div className="image-placeholder" style={{
        width: '100%',
        maxWidth: 900,
        margin: '0 auto 2rem auto',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)'
      }}>
        <img
          src={OverviewImage}
          alt="Application Overview"
          className="overview-image"
          style={{
            width: '100%',
            height: '320px',
            objectFit: 'cover',
            borderRadius: '0px',
            padding: '0px'
          }}
        />
      </div>

      <div className="features-section" style={{ maxWidth: 800, margin: '0 auto 3rem auto' }}>
        <div className="feature-panel">
          <p className="overview-text" style={{ fontSize: '1.15rem', lineHeight: 1.6 }}>
            <b>POWER Scheduler</b> is a healthcare scheduling system built with a Django backend and React frontend. Clinics and providers can upload events, holidays, staff lists, and provider lists directly from the app, manage availability and block times, and send automated text and email reminders. Notifications keep both organization and system administrators informed whenever patients register or appointments are created, ensuring seamless collaboration across the team. Patients can also request visits from the portal.
          </p>
        </div>
      </div>

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default OverviewPage;
