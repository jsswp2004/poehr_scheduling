import '../FeaturesPage/FeaturesPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import FeaturesImage from '../assets/dashboard_features2.png';

export const FeaturesPage = ({ className }) => {
  return (
    <div className={`features-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">All Features</h1>
        <p className="page-subtitle">Explore everything POWER offers across our plans.</p>
      </div>
      <div className="image-placeholder">
        <img 
        src={FeaturesImage} 
        alt="Features Overview" 
        className="features-image"
        style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '0px',
              padding: '0px'
            }} />
      </div>
      <div className="features-section">
        <div className="feature-panels">
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Professional</div>
            </div>
            <div className="panel-features">
              <div className="feature">Simple appointment scheduling for individual providers</div>
              <div className="feature">Standard calendar with daily and weekly views</div>
              <div className="feature">SMS & Email appointment notifications</div>
              <div className="feature">Mobile app access on iOS and Android</div>
              <div className="feature">Basic reporting and analytics</div>
            </div>
          </div>
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Clinic</div>
            </div>
            <div className="panel-features">
              <div className="feature">Support for multiple providers</div>
              <div className="feature">Team collaboration tools</div>
              <div className="feature">Multi-location scheduling</div>
              <div className="feature">Patient management portal</div>
              <div className="feature">Bulk SMS notifications</div>
              <div className="feature">Advanced scheduling rules and workflows</div>
              <div className="feature">API access and integrations</div>
              <div className="feature">Priority support</div>
            </div>
          </div>
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Group</div>
            </div>
            <div className="panel-features">
              <div className="feature">Unlimited users and organizations</div>
              <div className="feature">Multi-organization support</div>
              <div className="feature">Custom integrations & APIs</div>
              <div className="feature">Advanced analytics & reporting</div>
              <div className="feature">Custom branding and white-label options</div>
              <div className="feature">Dedicated account manager</div>
              <div className="feature">24/7 priority support with SLA guarantees</div>
              <div className="feature">On-premise deployment and professional services</div>
            </div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default FeaturesPage;
