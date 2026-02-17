// Simple test script to test the send-contact-email API
const http = require('http');

// Test against localhost or deployed backend
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

console.log('🧪 Testing Kiora Backend API');
console.log('📡 Backend URL:', BACKEND_URL);
console.log('');

const testData = {
  formType: 'schedule-test',
  userType: 'patient',
  fullName: 'Test User',
  emailAddress: 'test@example.com',
  phoneNumber: '+1234567890',
  city: 'Test City',
  pincode: '123456',
  message: 'This is a test message from the test script.',
  agreeToContact: true,
  selectedPlan: 'one-time' // or '90-days'
};

console.log('🧪 Testing backend API...\n');
console.log('📡 URL:', `${BACKEND_URL}/api/send-contact-email`);
console.log('📦 Payload:', JSON.stringify(testData, null, 2));
console.log('\n⏳ Sending request...\n');

const url = new URL(BACKEND_URL);
const postData = JSON.stringify(testData);

const options = {
  hostname: url.hostname,
  port: url.port || 3001,
  path: '/api/send-contact-email',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('📊 Response Status:', res.statusCode);
    console.log('📋 Response Headers:', res.headers);
    console.log('\n📨 Response Body:');
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log(data);
    }
    
    if (res.statusCode === 200) {
      console.log('\n✅ Test PASSED - Emails sent successfully!');
      console.log('');
      console.log('📧 Check both email inboxes:');
      console.log('   1. Business email (TARGET_EMAIL) - Notification email');
      console.log('   2. Sender email (test@example.com) - Confirmation email');
      console.log('');
      try {
        const parsed = JSON.parse(data);
        if (parsed.data?.submissionId) {
          console.log('💾 Database: Submission saved with ID:', parsed.data.submissionId);
        }
      } catch (e) {}
    } else {
      console.log('\n❌ Test FAILED - Check the response above');
      console.log('');
      console.log('💡 Troubleshooting:');
      console.log('   - Make sure backend server is running: npm start');
      console.log('   - Check RESEND_API_KEY is set in .env file');
      console.log('   - Verify backend URL is correct');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request Error:', error.message);
  console.error('💡 Make sure the backend server is running: npm start');
});

req.write(postData);
req.end();
