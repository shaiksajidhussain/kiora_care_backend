// Quick verification script to check Resend API key and configuration
require('dotenv').config();
const { Resend } = require('resend');

console.log('🔍 Verifying Backend Setup...\n');

// Check environment variables
const checks = {
  'RESEND_API_KEY': process.env.RESEND_API_KEY,
  'FROM_EMAIL': process.env.FROM_EMAIL || 'care@kiora.care (default)',
  'TARGET_EMAIL': process.env.TARGET_EMAIL || 'sanjusazid0@gmail.com (default)',
  'PORT': process.env.PORT || '3001 (default)',
  'DATABASE_URL': process.env.DATABASE_URL ? '✅ Set' : '⚠️  Not set (optional)',
};

console.log('📋 Environment Variables:');
Object.entries(checks).forEach(([key, value]) => {
  if (key === 'RESEND_API_KEY' && value) {
    const masked = value.substring(0, 10) + '...' + value.substring(value.length - 4);
    console.log(`   ${key}: ${masked}`);
  } else {
    console.log(`   ${key}: ${value}`);
  }
});

console.log('\n🔑 Testing Resend API Key...');

if (!process.env.RESEND_API_KEY) {
  console.log('❌ RESEND_API_KEY is not set!');
  console.log('   Please add it to your .env file');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

// Test API key by checking if it's valid format
const apiKeyPattern = /^re_[A-Za-z0-9_-]+$/;
if (!apiKeyPattern.test(process.env.RESEND_API_KEY)) {
  console.log('⚠️  API key format looks incorrect (should start with "re_")');
} else {
  console.log('✅ API key format is valid');
}

console.log('\n💡 Next Steps:');
console.log('   1. Start the server: npm start');
console.log('   2. Test the API: npm test');
console.log('   3. Check your email inbox for test emails');
console.log('   4. Make sure frontend .env points to: http://localhost:3001\n');
