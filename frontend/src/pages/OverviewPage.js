import "../OverviewPage/OverviewPage.css";
import Header from "../components/Header";
import Footer from "../components/Footer";
import schedulerImage from "../assets/dashboard_scheduling.jpg";
import communicatorImage from "../assets/communicator.png";
import portalImage from "../assets/Portal.png";

export const OverviewPage = ({ className }) => {
  return (
    <div className={`overview-page ${className || ""}`}>
      <Header />

      <div className="page-title-section">
        <h2 className="page-title">
          Discover the complete POWER healthcare management suite
        </h2>
        {/*<p className="page-subtitle">Discover the complete POWER healthcare management suite</p>*/}
      </div>

      <div className="three-panel-layout">
        {/* POWER Scheduler Panel */}
        <div className="application-panel">
          <div className="panel-image">
            <img
              src={schedulerImage}
              alt="POWER Scheduler Dashboard"
              className="app-image"
            />
          </div>
          <div className="panel-content">
            <h2 className="app-title">POWER Scheduler</h2>
            <p className="app-description">
              Comprehensive healthcare scheduling system built with Django
              backend and React frontend. Clinics and providers can manage
              availability, upload events and staff lists, and send automated
              reminders.
            </p>

            <div className="feature-highlights">
              <div className="highlight-item">
                <span className="highlight-icon">📅</span>
                <span className="highlight-text">
                  Smart scheduling with availability management
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📱</span>
                <span className="highlight-text">
                  Automated SMS and email reminders
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">🔔</span>
                <span className="highlight-text">
                  Real-time notifications for administrators
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">⏰</span>
                <span className="highlight-text">
                  Block time and holiday management
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* POWER Communicator Panel */}
        <div className="application-panel">
          <div className="panel-image">
            <img
              src={communicatorImage}
              alt="POWER Communicator Interface"
              className="app-image"
            />
          </div>
          <div className="panel-content">
            <h2 className="app-title">POWER Communicator</h2>
            <p className="app-description">
              Streamlined healthcare communication platform ensuring secure,
              HIPAA-compliant messaging between providers, staff, and patients
              with on time updates and alerts.
            </p>

            <div className="feature-highlights">
              <div className="highlight-item">
                <span className="highlight-icon">💬</span>
                <span className="highlight-text">
                  Secure HIPAA-compliant messaging
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">🚨</span>
                <span className="highlight-text">
                  Provider alerts and notifications
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📞</span>
                <span className="highlight-text">
                  Patient communication hub
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">🔒</span>
                <span className="highlight-text">End-to-end encryption</span>
              </div>
            </div>
          </div>
        </div>

        {/* POWER Portal Panel */}
        <div className="application-panel">
          <div className="panel-image">
            <img
              src={portalImage}
              alt="POWER Portal Patient Interface"
              className="app-image"
            />
          </div>
          <div className="panel-content">
            <h2 className="app-title">POWER Portal</h2>
            <p className="app-description">
              Patient self-service portal providing 24/7 access to online
              services, appointment booking and requests with intuitive user
              experience.
            </p>

            <div className="feature-highlights">
              <div className="highlight-item">
                <span className="highlight-icon">👥</span>
                <span className="highlight-text">Patient visit requests</span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📋</span>
                <span className="highlight-text">Schedule access</span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📢</span>
                <span className="highlight-text">
                  Messages and Announcements
                </span>
              </div>
              <div className="highlight-item">
                <span className="highlight-icon">📱</span>
                <span className="highlight-text">Mobile-responsive design</span>
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
