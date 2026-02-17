// Script to check database submissions
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false
});

async function checkDatabase() {
  console.log('🔍 Checking Database Submissions...\n');

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Check if table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'form_submissions'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('⚠️  Table "form_submissions" does not exist yet.');
      console.log('   It will be created automatically on first submission.\n');
      await pool.end();
      return;
    }

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM form_submissions');
    const totalCount = countResult.rows[0].count;
    console.log(`📊 Total Submissions: ${totalCount}\n`);

    if (totalCount === '0') {
      console.log('📭 No submissions found in database yet.');
      console.log('   Submit a form to see data here!\n');
      await pool.end();
      return;
    }

    // Get recent submissions
    console.log('📋 Recent Submissions (Last 10):\n');
    const recentSubmissions = await pool.query(`
      SELECT 
        id,
        form_type,
        full_name,
        email_address,
        phone_number,
        city,
        selected_plan,
        created_at
      FROM form_submissions 
      ORDER BY created_at DESC 
      LIMIT 10
    `);

    recentSubmissions.rows.forEach((row, index) => {
      console.log(`${index + 1}. ID: ${row.id}`);
      console.log(`   Name: ${row.full_name}`);
      console.log(`   Email: ${row.email_address}`);
      console.log(`   Phone: ${row.phone_number}`);
      console.log(`   Form Type: ${row.form_type}`);
      console.log(`   Plan: ${row.selected_plan || 'N/A'}`);
      console.log(`   City: ${row.city || 'N/A'}`);
      console.log(`   Submitted: ${new Date(row.created_at).toLocaleString()}`);
      console.log('');
    });

    // Get statistics
    console.log('📈 Statistics:\n');
    const stats = await pool.query(`
      SELECT 
        form_type,
        selected_plan,
        COUNT(*) as count
      FROM form_submissions
      GROUP BY form_type, selected_plan
      ORDER BY count DESC
    `);

    stats.rows.forEach(row => {
      console.log(`   ${row.form_type}${row.selected_plan ? ` (${row.selected_plan})` : ''}: ${row.count}`);
    });

    console.log('');

  } catch (error) {
    console.error('❌ Database Error:', error.message);
    console.error('\n💡 Make sure:');
    console.error('   1. DATABASE_URL is set in .env file');
    console.error('   2. Database is accessible');
    console.error('   3. Credentials are correct\n');
  } finally {
    if (pool && !pool.ended) {
      await pool.end();
    }
  }
}

checkDatabase();
