-- SQL Queries to Check Form Submissions
-- Run these queries in your PostgreSQL database client (pgAdmin, DBeaver, etc.)

-- 1. Check if table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'form_submissions'
);

-- 2. View all submissions (most recent first)
SELECT 
  id,
  form_type,
  user_type,
  full_name,
  email_address,
  phone_number,
  city,
  pincode,
  selected_plan,
  agree_to_contact,
  created_at,
  updated_at
FROM form_submissions 
ORDER BY created_at DESC;

-- 3. Count total submissions
SELECT COUNT(*) as total_submissions FROM form_submissions;

-- 4. Count by form type
SELECT 
  form_type,
  COUNT(*) as count
FROM form_submissions
GROUP BY form_type;

-- 5. Count by selected plan
SELECT 
  selected_plan,
  COUNT(*) as count
FROM form_submissions
WHERE selected_plan IS NOT NULL
GROUP BY selected_plan;

-- 6. View recent schedule test submissions
SELECT 
  id,
  full_name,
  email_address,
  phone_number,
  selected_plan,
  city,
  created_at
FROM form_submissions
WHERE form_type = 'schedule-test'
ORDER BY created_at DESC
LIMIT 20;

-- 7. View contact form submissions
SELECT 
  id,
  full_name,
  email_address,
  phone_number,
  message,
  created_at
FROM form_submissions
WHERE form_type = 'contact'
ORDER BY created_at DESC
LIMIT 20;

-- 8. Get submissions from last 24 hours
SELECT 
  id,
  form_type,
  full_name,
  email_address,
  selected_plan,
  created_at
FROM form_submissions
WHERE created_at >= NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- 9. Check database table structure
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'form_submissions'
ORDER BY ordinal_position;
