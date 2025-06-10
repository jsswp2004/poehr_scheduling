import '../SolutionsPage/SolutionsPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';
import SchedulerImage from '../assets/dashboard_scheduling.png';
import CommunicatorImage from '../assets/dashboard_together.png';
import PortalImage from '../assets/dashboard_overview.png';

export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();
  const handleSchedulerClick = () => {
    navigate('/login');
  };

  return (
    <div className={`solutions-page ${className || ''}`}>
      <Header />
      <div className="solutions-content">
        <div className="solution-button" onClick={handleSchedulerClick} style={{ cursor: 'pointer' }}>
          <img src={SchedulerImage} alt="Scheduler" className="solution-image" />
          <div className="solution-label">Scheduler</div>
        </div>
        <div className="solution-button" style={{ cursor: 'pointer' }}>
          <img src={CommunicatorImage} alt="Communicator" className="solution-image" />
          <div className="solution-label">Communicator</div>
        </div>
        <div className="solution-button" style={{ cursor: 'pointer' }}>
          <img src={PortalImage} alt="Portal" className="solution-image" />
          <div className="solution-label">Portal</div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
