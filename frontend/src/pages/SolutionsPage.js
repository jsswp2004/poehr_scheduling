import '../SolutionsPage/SolutionsPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { useNavigate } from 'react-router-dom';

export const SolutionsPage = ({ className }) => {
  const navigate = useNavigate();
  const handleSchedulerClick = () => {
    navigate('/login');
  };

  return (
    <div className={`solutions-page ${className || ''}`}>
      <Header />
      <div className="solutions-content">
        <div className="solution-button" onClick={handleSchedulerClick} style={{cursor: 'pointer'}}>
          Scheduler
        </div>
        <div className="solution-button" style={{cursor: 'pointer'}}>
          Communicator
        </div>
        <div className="solution-button" style={{cursor: 'pointer'}}>
          Portal
        </div>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default SolutionsPage;
