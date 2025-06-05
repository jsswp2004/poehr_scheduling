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
      </div>      <div className="content-panels">
        <div className="image-panel">
          <div className="image-container">
            <img
              src={OverviewImage}
              alt="Application Overview"
              className="overview-image"
            />
          </div>
        </div>

        <div className="features-panel">
          <div className="feature-content">
            <h2 className="features-title">Comprehensive Healthcare Scheduling</h2>
            <p className="overview-text">
              <b>POWER Scheduler</b> is a healthcare scheduling system built with a Django backend and React frontend. Clinics and providers can upload events, holidays, staff lists, and provider lists directly from the app, manage availability and block times, and send automated text and email reminders.
            </p>
            
            <div className="feature-highlights">
              <div className="highlight-item">
                <span className="highlight-icon">📅</span>
                <span className="highlight-text">Smart scheduling with availability management</span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📱</span>
                <span className="highlight-text">Automated SMS and email reminders</span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">🔔</span>
                <span className="highlight-text">Real-time notifications for administrators</span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">👥</span>
                <span className="highlight-text">Patient portal for visit requests</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default OverviewPage;
