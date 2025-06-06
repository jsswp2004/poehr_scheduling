// Font Awesome icon library setup
import { library } from '@fortawesome/fontawesome-svg-core';
import { 
  faSignOutAlt, 
  faUser, 
  faCalendarAlt, 
  faUserMd, 
  faHospital, 
  faCog 
} from '@fortawesome/free-solid-svg-icons';

// Add all icons you want to use in your app
library.add(
  faSignOutAlt,
  faUser,
  faCalendarAlt,
  faUserMd,
  faHospital,
  faCog
);

export default library;
