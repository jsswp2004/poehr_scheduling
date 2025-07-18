import axios from 'axios';

// Test script to check date filtering functionality
async function testDateFiltering() {
  const token = localStorage.getItem('access_token');
  const baseUrl = 'http://127.0.0.1:8000/api/communicator/logs/';
  
  console.log('Testing MessageLog API date filtering...');
  
  try {
    // Test 1: Get all logs first
    console.log('\n1. Testing basic API call (all logs)');
    const allLogsRes = await axios.get(`${baseUrl}?message_type=email`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`Total logs found: ${allLogsRes.data.length}`);
    
    if (allLogsRes.data.length > 0) {
      const sampleLog = allLogsRes.data[0];
      console.log(`Sample log date: ${sampleLog.created_at}`);
      
      // Test 2: Filter by start date (recent logs)
      console.log('\n2. Testing start date filter (recent logs)');
      const recentDate = '2024-01-01'; // Adjust based on your data
      const startDateRes = await axios.get(`${baseUrl}?message_type=email&created_at__gte=${recentDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Logs after ${recentDate}: ${startDateRes.data.length}`);
      
      // Test 3: Filter by end date (older logs)
      console.log('\n3. Testing end date filter (older logs)');
      const endDate = '2025-12-31';
      const endDateRes = await axios.get(`${baseUrl}?message_type=email&created_at__lte=${endDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Logs before ${endDate}: ${endDateRes.data.length}`);
      
      // Test 4: Filter by date range
      console.log('\n4. Testing date range filter');
      const rangeStartDate = '2024-01-01';
      const rangeEndDate = '2025-12-31';
      const rangeRes = await axios.get(`${baseUrl}?message_type=email&created_at__gte=${rangeStartDate}&created_at__lte=${rangeEndDate}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Logs between ${rangeStartDate} and ${rangeEndDate}: ${rangeRes.data.length}`);
      
      // Test 5: Test with narrow date range (should return fewer results)
      console.log('\n5. Testing narrow date range');
      const narrowStart = '2024-06-01';
      const narrowEnd = '2024-06-30';
      const narrowRes = await axios.get(`${baseUrl}?message_type=email&created_at__gte=${narrowStart}&created_at__lte=${narrowEnd}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Logs in June 2024: ${narrowRes.data.length}`);
    }
    
    console.log('\n✅ Date filtering tests completed!');
    
  } catch (error) {
    console.error('❌ Error testing date filtering:', error.response?.data || error.message);
  }
}

// Note: This script is meant to be run in browser console where localStorage is available
console.log('To test date filtering:');
console.log('1. Make sure you are logged in');
console.log('2. Run testDateFiltering() in the browser console');
console.log('3. Check the console output for results');

// Export for browser console use
window.testDateFiltering = testDateFiltering;
