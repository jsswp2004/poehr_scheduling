import { useState } from 'react';
import { toast } from 'react-toastify';
import axios from 'axios';

function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      // Adjust this URL to match your backend endpoint
      await axios.post('http://127.0.0.1:8000/api/password-reset/', { email });

      setSubmitted(true);
      toast.success('If this email is registered, a reset link has been sent.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to send reset link. Please try again.');
    }
  };

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6">
          <h3 className="mb-4">Forgot Password</h3>
          {submitted ? (
            <div className="alert alert-success">
              Check your email for the password reset link.
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-3">
                <label htmlFor="email" className="form-label">Email address</label>
                <input
                  type="email"
                  className="form-control"
                  id="email"
                  placeholder="Enter your registered email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary w-100">Send Reset Link</button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ForgotPasswordPage;
