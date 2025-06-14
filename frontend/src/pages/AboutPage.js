import '../AboutPage/AboutPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import CEOPicture from '../assets/CEO_CTO.png'; // CEO image
import COOPicture from '../assets/COO.png'; // COO image

export const AboutPage = ({ className }) => {
  return (
    <div className={`about-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">About Us</h1>        
        <p className="page-subtitle">Meet the team behind POWER IT Systems.</p>

        <div className="page-subtitle-wide">
          <p>
            At the heart of our mission is a deep understanding of healthcare—built on more than 20 years of combined experience in clinical environments, administrative systems, and patient care coordination. Our team brings firsthand knowledge of healthcare workflows and operational processes, allowing us to design solutions that are not only technically sound but also practically effective.
          </p>
          <p>
            We understand the daily challenges that providers, schedulers, and administrators face because we've lived them. This insight drives our commitment to building tools that streamline operations, reduce friction, and improve communication—without compromising compliance or care quality.
          </p>
          <p>
            What sets us apart is our unwavering dedication to service. We're not just software developers—we are healthcare professionals, innovators, and problem solvers committed to empowering clinics with technology that truly fits their needs.
          </p>
          <p>
            With a passion for meaningful impact and a standard of excellence in everything we do, we're here to make your scheduling, communication, and clinic management simpler, smarter, and more human-centered.
          </p>
        </div>
      </div>
      <div className="team-section">
        <div className="team-grid">
          <div className="team-card">
            <div className="team-image">
              <img src={CEOPicture} alt="CEO/CTO" />
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
              <img src={COOPicture} alt="COO" />
            </div>
            <div className="team-name">Charlina Pangilinan, RN, BSN</div>
            <div className="team-role">COO</div>
            <div className="team-details">
              Acute Renal Dialysis<br /> 
              Infection Control
            </div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default AboutPage;
