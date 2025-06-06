import '../ContactPage/ContactPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

export const ContactPage = ({ className }) => {
  return (
    <div className={`contact-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Contact Us</h1>
        <p className="page-subtitle">We'd love to hear from you. Reach out to our team using the information below.</p>
      </div>
      <div className="contact-section">
        <div className="contact-grid">
          <div className="contact-card">
            <div className="contact-title">Address</div>
            <div className="contact-details">123 Placeholder Street<br/>City, State ZIP</div>
          </div>
          <div className="contact-card">
            <div className="contact-title">Phone</div>
            <div className="contact-details">(123) 456-7890</div>
          </div>
          <div className="contact-card">
            <div className="contact-title">Email</div>
            <div className="contact-details">contact@example.com</div>
          </div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default ContactPage;
