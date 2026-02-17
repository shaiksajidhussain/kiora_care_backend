# Testing Guide

## Quick Start Testing

### Step 1: Get Resend API Key

**Option A: Use Existing AWS ECS Key (Easiest)**
- You already have a Resend API key in your AWS ECS: `re_ER61dsiM_53SzCuWrGJFPvmYEeaKDK6aw`
- Just use this one! No need to create a new account.

**Option B: Create New Resend Account (If you want a separate key)**
1. Go to https://resend.com
2. Sign up / Login
3. Go to **API Keys** section
4. Click **Create API Key**
5. Copy the key (starts with `re_...`)

### Step 2: Set Up Environment Variables

Create `.env` file in the `backend` folder:

```env
# Use your existing Resend API key from AWS ECS
RESEND_API_KEY=re_ER61dsiM_53SzCuWrGJFPvmYEeaKDK6aw

# Email settings
FROM_EMAIL=care@kiora.care
TARGET_EMAIL=sanjusazid0@gmail.com

# Database (optional - for storing submissions)
DATABASE_URL=postgresql://kiora:KioraCKD2024!Secure@kiora-ckd-production-postgres.cw3w6s4qcpk2.us-east-1.rds.amazonaws.com:5432/kiora

# Server
PORT=3001
ALLOWED_ORIGIN=*
```

### Step 3: Install Dependencies & Start Server

```bash
cd backend
npm install
npm start
```

You should see:
```
✅ Backend server running on http://localhost:3001
📧 Health check: http://localhost:3001/api/health
📨 Email endpoint: http://localhost:3001/api/send-contact-email
🗄️  Database: Connected
```

### Step 4: Test the API

**Method 1: Using the test script**
```bash
npm test
```

**Method 2: Using curl**
```bash
curl -X POST http://localhost:3001/api/send-contact-email \
  -H "Content-Type: application/json" \
  -d '{
    "formType": "schedule-test",
    "userType": "patient",
    "fullName": "Test User",
    "emailAddress": "test@example.com",
    "phoneNumber": "+1234567890",
    "city": "Test City",
    "pincode": "123456",
    "message": "This is a test submission",
    "agreeToContact": true,
    "selectedPlan": "one-time"
  }'
```

**Method 3: Test from Frontend**
1. Make sure frontend is running
2. Set `VITE_BACKEND_URL=http://localhost:3001` in frontend `.env`
3. Fill out the contact form or schedule test form
4. Submit and check:
   - Your email inbox (`TARGET_EMAIL` = sanjusazid0@gmail.com)
   - The sender's email inbox (the email they entered in the form)

## What Happens When a User Fills the Form?

### 1. **User submits form** → Frontend sends POST request to `/api/send-contact-email`

### 2. **Backend processes:**
   - ✅ Validates required fields
   - ✅ **Saves to database** (if `DATABASE_URL` is set)
   - ✅ **Sends notification email** → `TARGET_EMAIL` (sanjusazid0@gmail.com)
   - ✅ **Sends confirmation email** → User's email address

### 3. **Data Collection:**

**In Database (PostgreSQL):**
- All submissions are stored in `form_submissions` table
- You can query them:
  ```sql
  SELECT * FROM form_submissions ORDER BY created_at DESC;
  ```

**In Email:**
- You receive notification email with all form details
- User receives confirmation email

## Testing Checklist

- [ ] Backend server starts successfully
- [ ] Health check returns `{"status":"ok"}`
- [ ] Test API call succeeds (200 response)
- [ ] Notification email received at `TARGET_EMAIL`
- [ ] Confirmation email received at sender's email
- [ ] Database record created (if `DATABASE_URL` is set)
- [ ] Frontend form submission works

## Troubleshooting

### "RESEND_API_KEY missing" error
- Make sure `.env` file exists in `backend` folder
- Check that `RESEND_API_KEY` is set correctly

### "Database connection failed"
- Check `DATABASE_URL` is correct
- Database is optional - emails will still work without it

### Emails not sending
- Verify Resend API key is valid
- Check Resend dashboard for any errors
- Make sure `FROM_EMAIL` domain is verified in Resend (if using custom domain)

### Frontend can't connect
- Make sure backend is running on correct port
- Check `VITE_BACKEND_URL` in frontend `.env`
- Verify CORS settings (`ALLOWED_ORIGIN`)

## Viewing Collected Data

### From Database:
```sql
-- View all submissions
SELECT * FROM form_submissions ORDER BY created_at DESC;

-- Count by form type
SELECT form_type, COUNT(*) FROM form_submissions GROUP BY form_type;

-- View schedule test submissions
SELECT * FROM form_submissions WHERE form_type = 'schedule-test';

-- View by plan
SELECT selected_plan, COUNT(*) FROM form_submissions 
WHERE selected_plan IS NOT NULL 
GROUP BY selected_plan;
```

### From Email:
- Check your inbox at `TARGET_EMAIL` (sanjusazid0@gmail.com)
- Each submission sends a notification email with all details
