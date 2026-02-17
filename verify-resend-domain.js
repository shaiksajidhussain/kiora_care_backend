// Script to verify Resend domain status
require('dotenv').config();
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function checkDomain() {
  console.log('🔍 Checking Resend Domain Status...\n');
  console.log('FROM_EMAIL:', process.env.FROM_EMAIL);
  console.log('TARGET_EMAIL:', process.env.TARGET_EMAIL);
  console.log('');

  try {
    // Try to get domains list
    const response = await fetch('https://api.resend.com/domains', {
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('✅ Domains in your Resend account:');
      if (data.data && data.data.length > 0) {
        data.data.forEach(domain => {
          console.log(`   - ${domain.name}: ${domain.status === 'verified' ? '✅ Verified' : '⚠️  Not verified'}`);
        });
      } else {
        console.log('   ⚠️  No domains found. Add domain at https://resend.com/domains');
      }
    } else {
      const error = await response.json();
      console.log('❌ Error checking domains:', error);
    }
  } catch (error) {
    console.log('⚠️  Could not check domain status via API');
    console.log('💡 Please check manually at: https://resend.com/domains');
  }

  console.log('\n📋 Current Configuration:');
  console.log(`   FROM_EMAIL: ${process.env.FROM_EMAIL}`);
  console.log(`   TARGET_EMAIL: ${process.env.TARGET_EMAIL}`);
  console.log('\n💡 If domain is verified but still getting errors:');
  console.log('   1. Make sure domain status shows "Verified" in Resend dashboard');
  console.log('   2. Wait a few minutes after verification (DNS propagation)');
  console.log('   3. Restart your backend server after changing .env');
  console.log('   4. Check Resend dashboard for any domain warnings\n');
}

checkDomain();
