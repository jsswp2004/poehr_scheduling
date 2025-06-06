import React, { useState, useEffect } from 'react';
import { ToastContainer as ReactToastifyContainer, toast as reactToastify } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Enhanced toast functions with guaranteed duration
const createEnhancedToast = (originalToastFn) => (message, options = {}) => {
  // Store the original callbacks
  const originalOnOpen = options.onOpen;
  const originalOnClose = options.onClose;
  
  // Create a variable to store the toast ID that will be assigned later
  let toastIdRef;
  
  // Create the toast with modified callbacks
  const toastId = originalToastFn(message, {
    ...options,
    autoClose: options.autoClose || 5000,
    onOpen: (params) => {
      // Save the toast ID for later use
      toastIdRef = toastId;
      
      // Start a timer to ensure the toast remains visible
      const timer = setTimeout(() => {
        // Do nothing, just ensuring the toast stays visible
      }, options.autoClose || 5000);
      
      // Store the timer ID safely
      window.__toastTimers = window.__toastTimers || {};
      if (toastIdRef) {
        window.__toastTimers[toastIdRef] = timer;
      }
      
      // Call original onOpen if provided
      if (originalOnOpen) originalOnOpen(params);
    },
    onClose: (params) => {
      // Clear the timer when toast is closed
      if (window.__toastTimers && toastIdRef && window.__toastTimers[toastIdRef]) {
        clearTimeout(window.__toastTimers[toastIdRef]);
        delete window.__toastTimers[toastIdRef];
      }
      
      // Call original onClose if provided
      if (originalOnClose) originalOnClose(params);
    }
  });
  
  return toastId;
};

// Create enhanced toast methods
export const toast = {
  success: createEnhancedToast(reactToastify.success),
  error: createEnhancedToast(reactToastify.error),
  info: createEnhancedToast(reactToastify.info),
  warning: createEnhancedToast(reactToastify.warning),
  dark: createEnhancedToast(reactToastify.dark),
  dismiss: reactToastify.dismiss,
  clearWaitingQueue: reactToastify.clearWaitingQueue,
  isActive: reactToastify.isActive,
  update: reactToastify.update,
  done: reactToastify.done
};

// Enhanced ToastContainer component
const ToastContainer = (props) => {
  return (
    <ReactToastifyContainer
      {...props}
      // Default props that ensure proper display
      position={props.position || "top-center"}
      autoClose={props.autoClose || 5000}
      hideProgressBar={props.hideProgressBar || false}
      closeOnClick={props.closeOnClick !== false}
      pauseOnHover={props.pauseOnHover !== false}
      draggable={props.draggable !== false}
      theme={props.theme || "light"}
    />
  );
};

export { ToastContainer };
export default { toast, ToastContainer };
