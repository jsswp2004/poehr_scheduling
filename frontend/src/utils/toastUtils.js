// Custom toast utility for consistent toast configuration across the app
import { toast } from 'react-toastify';

// Default toast configuration
const defaultToastOptions = {
  position: "top-center",
  autoClose: 2000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
};

// Create toast utility functions with consistent configuration
const toastUtils = {
  success: (message, options = {}) => {
    return toast.success(message, { ...defaultToastOptions, ...options });
  },
  error: (message, options = {}) => {
    return toast.error(message, { ...defaultToastOptions, ...options });
  },
  info: (message, options = {}) => {
    return toast.info(message, { ...defaultToastOptions, ...options });
  },
  warning: (message, options = {}) => {
    return toast.warning(message, { ...defaultToastOptions, ...options });
  }
};

export { toastUtils };
export default toastUtils;
