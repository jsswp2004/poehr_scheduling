import React from 'react';
import { ToastContainer as ReactToastifyContainer, toast as reactToastify } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Simple toast wrapper that uses react-toastify directly
export const toast = {
  success: (message, options = {}) => 
    reactToastify.success(message, { 
      autoClose: 2000, 
      position: "top-center",
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      ...options 
    }),
  error: (message, options = {}) => 
    reactToastify.error(message, { 
      autoClose: 2000, 
      position: "top-center",
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      ...options 
    }),
  info: (message, options = {}) => 
    reactToastify.info(message, { 
      autoClose: 2000, 
      position: "top-center",
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      ...options 
    }),
  warning: (message, options = {}) => 
    reactToastify.warning(message, { 
      autoClose: 2000, 
      position: "top-center",
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      ...options 
    }),
  // Forward other methods directly
  dismiss: reactToastify.dismiss,
  clearWaitingQueue: reactToastify.clearWaitingQueue,
  isActive: reactToastify.isActive,
  update: reactToastify.update,
  done: reactToastify.done
};

// Enhanced ToastContainer component with fixed settings
export const ToastContainer = (props) => (
  <ReactToastifyContainer
    position="top-center"
    autoClose={2000}
    hideProgressBar={false}
    newestOnTop={false}
    closeOnClick
    rtl={false}
    pauseOnFocusLoss
    draggable
    pauseOnHover
    {...props}
  />
);

export default { toast, ToastContainer };
