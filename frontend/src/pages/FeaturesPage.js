import '../FeaturesPage/FeaturesPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';


export const FeaturesPage = ({ className }) => {
  return (
    <div className={`features-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">All Features</h1>
        <p className="page-subtitle">Explore the services you can choose from. Pricing is set by the services you pick.</p>
      </div>

      <div className="features-section">
        <div className="feature-panels">
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Clinical</div>
            </div>
            <div className="panel-features">
              <div className="feature">Patient Portal: sign-in, my information, announcements, appointment requests</div>
              <div className="feature">Clinical Notes: notes, flowsheets and their builders, vaccines and screenings, orders and lab results, prescriptions and referrals, triage and status boards</div>
            </div>
          </div>
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Operations</div>
            </div>
            <div className="panel-features">
              <div className="feature">Scheduling and calendar: appointments, availability, holidays, check-in</div>
              <div className="feature">Staffing and coverage: roster, shifts, coverage status, time off</div>
              <div className="feature">Communicator: automatic reminders, bulk text and email</div>
            </div>
          </div>
          <div className="feature-panel">
            <div className="panel-header">
              <div className="panel-title">Add-ons and included</div>
            </div>
            <div className="panel-features">
              <div className="feature">Telehealth: video visits with a join link for patients</div>
              <div className="feature">Voice dictation: speak into a note, with optional AI clean-up you review</div>
              <div className="feature">Electronic lab interface: set up by arrangement and quoted separately</div>
              <div className="feature">Reports: build, save, share and export, free with every plan</div>
              <div className="feature">Secure staff messaging, included with every plan</div>
            </div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default FeaturesPage;
