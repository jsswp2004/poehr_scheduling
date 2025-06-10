import '../SolutionsPage/SolutionsPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';

import SchedulerImage from '../assets/Scheduler.png';
import CommunicatorImage from '../assets/communicator.png';
import PortalImage from '../assets/Portal.png';



export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();  const handleSchedulerClick = () => {
    navigate('/login');
  };
    const handleCommunicatorClick = () => {
    // Always navigate to login with communicator redirect
    navigate('/login?redirect=communicator');
  };
  return (
    <div className={`solutions-page ${className || ''}`}>
      <Header />
      <div className="solutions-content">

        <div className="solution-button" onClick={handleSchedulerClick} style={{ cursor: 'pointer' }}>
          <img src={SchedulerImage} alt="Scheduler" className="solution-image" />
          <div className="solution-label">Scheduler</div>
        </div>
        <div className="solution-button" onClick={handleCommunicatorClick}  style={{ cursor: 'pointer' }}>
          <img src={CommunicatorImage} alt="Communicator" className="solution-image" />
          <div className="solution-label">Communicator</div>
        </div>        <div className="solution-button" style={{ cursor: 'pointer' }}>
          <img src={PortalImage} alt="Portal" className="solution-image" />
          <div className="solution-label">Portal</div>
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
