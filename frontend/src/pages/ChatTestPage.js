import React, { useState } from 'react';
import { ChatSystemTester } from '../utils/ChatSystemTester';
import './ChatTestPage.css';

const ChatTestPage = () => {
  const [testResults, setTestResults] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [tester] = useState(() => new ChatSystemTester());

  const runTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    try {
      const results = await tester.runComprehensiveTest();
      setTestResults(results.results || []);
    } catch (error) {
      console.error('Test execution error:', error);
      setTestResults([{
        timestamp: new Date().toISOString(),
        message: `Test execution failed: ${error.message}`,
        type: 'error'
      }]);
    } finally {
      setIsRunning(false);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  };

  const getTypeClass = (type) => {
    switch (type) {
      case 'success': return 'test-success';
      case 'error': return 'test-error';
      case 'warning': return 'test-warning';
      default: return 'test-info';
    }
  };

  return (
    <div className="chat-test-page">
      <div className="test-header">
        <h1>Chat System Tester</h1>
        <p>Comprehensive validation of the real-time chat system</p>
      </div>

      <div className="test-controls">
        <button 
          onClick={runTests} 
          disabled={isRunning}
          className="run-tests-btn"
        >
          {isRunning ? 'Running Tests...' : 'Run Comprehensive Tests'}
        </button>
      </div>

      {testResults.length > 0 && (
        <div className="test-results">
          <h2>Test Results</h2>
          <div className="results-list">
            {testResults.map((result, index) => (
              <div key={index} className={`test-result ${getTypeClass(result.type)}`}>
                <span className="result-icon">{getTypeIcon(result.type)}</span>
                <span className="result-timestamp">
                  {new Date(result.timestamp).toLocaleTimeString()}
                </span>
                <span className="result-message">{result.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isRunning && (
        <div className="test-progress">
          <div className="loading-spinner"></div>
          <p>Running tests, please wait...</p>
        </div>
      )}
    </div>
  );
};

export default ChatTestPage;
