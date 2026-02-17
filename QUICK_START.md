# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Create .env File
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env` and add your Resend API key:
```env
RESEND_API_KEY=re_ER61dsiM_53SzCuWrGJFPvmYEeaKDK6aw
FROM_EMAIL=care@kiora.care
TARGET_EMAIL=sanjusazid0@gmail.com
PORT=3001
```

**Optional:** Add database URL to store submissions:
```env
DATABASE_URL=postgresql://kiora:KioraCKD2024!Secure@kiora-ckd-production-postgres.cw3w6s4qcpk2.us-east-1.rds.amazonaws.com:5432/kiora
```

### 3. Start Server
```bash
npm start
```

## ✅ Test It

**Option 1: Test Script**
```bash
npm test
```

**Option 2: Test from Frontend**
1. Set `VITE_BACKEND_URL=http://localhost:3001` in frontend `.env`
2. Fill out the form on your website
3. Check your email inbox!

## 📧 What Happens?

When a user fills the form:
1. ✅ Data is saved to database (if DATABASE_URL is set)
2. ✅ You receive notification email at `TARGET_EMAIL`
3. ✅ User receives confirmation email at their email

## 🔑 Resend API Key

**You already have one!** Use: `re_ER61dsiM_53SzCuWrGJFPvmYEeaKDK6aw`

Or get a new one:
1. Go to https://resend.com
2. Sign up / Login
3. Go to API Keys → Create API Key
4. Copy the key (starts with `re_...`)

## 📊 View Collected Data

**From Database:**
```sql
SELECT * FROM form_submissions ORDER BY created_at DESC;
```

**From Email:**
- Check inbox at `TARGET_EMAIL` (sanjusazid0@gmail.com)
