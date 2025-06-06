import '../AboutPage/AboutPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

export const AboutPage = ({ className }) => {
  return (
    <div className={`about-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">About Us</h1>
        <p className="page-subtitle">Meet the team behind POWER IT Systems.</p>
      </div>
      <div className="team-section">
        <div className="team-grid">
          <div className="team-card">
            <div className="team-image">
              <img src="https://via.placeholder.com/200" alt="CEO/CTO" />
            </div>
            <div className="team-name">Jesus Salvacion, RN, MSN</div>
            <div className="team-role">CEO / CTO</div>
            <div className="team-details">
              IBM Certified Full Stack Engineer<br />
              IBM Certified AI Developer
            </div>
          </div>
          <div className="team-card">
            <div className="team-image">
              <img src="https://via.placeholder.com/200" alt="COO" />
            </div>
            <div className="team-name">Full Name</div>
            <div className="team-role">COO</div>
            <div className="team-details">Professional bio goes here.</div>
          </div>
          <div className="team-card">
            <div className="team-image">
              <img src="https://via.placeholder.com/200" alt="Senior Project Manager" />
            </div>
            <div className="team-name">Full Name</div>
            <div className="team-role">Senior Project Manager</div>
            <div className="team-details">Professional bio goes here.</div>
          </div>
          <div className="team-card">
            <div className="team-image">
              <img src="https://via.placeholder.com/200" alt="Client Service Manager" />
            </div>
            <div className="team-name">Full Name</div>
            <div className="team-role">Client Service Manager</div>
            <div className="team-details">Professional bio goes here.</div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default AboutPage;
