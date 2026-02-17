// Script to clear all form submissions from the database
require('dotenv').config();
const { Pool } = require('pg');

async function clearDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set in .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔍 Connecting to database...');
    
    // Check current count
    const countResult = await pool.query('SELECT COUNT(*) FROM form_submissions');
    const totalCount = parseInt(countResult.rows[0].count);
    
    if (totalCount === 0) {
      console.log('✅ Database is already empty. No records to delete.');
      await pool.end();
      return;
    }

    console.log(`📊 Found ${totalCount} submissions in database`);
    
    // Get breakdown by form type
    const breakdownResult = await pool.query(`
      SELECT form_type, COUNT(*) as count 
      FROM form_submissions 
      GROUP BY form_type
    `);
    
    console.log('\n📋 Current data breakdown:');
    breakdownResult.rows.forEach(row => {
      console.log(`   ${row.form_type}: ${row.count} submissions`);
    });

    // Delete all records
    console.log('\n🗑️  Deleting all submissions...');
    const deleteResult = await pool.query('DELETE FROM form_submissions');
    
    console.log(`✅ Successfully deleted ${deleteResult.rowCount} submissions`);
    console.log('✅ Database cleared successfully!');
    
    // Verify deletion
    const verifyResult = await pool.query('SELECT COUNT(*) FROM form_submissions');
    const remainingCount = parseInt(verifyResult.rows[0].count);
    
    if (remainingCount === 0) {
      console.log('✅ Verification: Database is now empty');
    } else {
      console.log(`⚠️  Warning: ${remainingCount} records still remain`);
    }

  } catch (error) {
    console.error('❌ Error clearing database:', error.message);
    if (error.code === '42P01') {
      console.error('   Table "form_submissions" does not exist yet.');
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run the script
clearDatabase();
