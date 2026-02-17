# Kiora Care Backend API

Express.js backend for handling contact form and schedule test submissions with email notifications.  

## Features

- ✅ Contact form submissions
- ✅ Schedule test form (₹999 Essential (One time test) & ₹3,999 Signature (90 Days plan))
- ✅ Sends **TWO emails** per submission:
  1. **Notification email** → Business/Team (TARGET_EMAIL)
  2. **Confirmation email** → Person who submitted the form
- ✅ **Database storage** - Saves all submissions to PostgreSQL (optional)
- ✅ **AWS ECS compatible** - Uses existing Resend API key from ECS environment
- ✅ **Health check endpoint** - Includes database connection status

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your Resend API key:

```env
RESEND_API_KEY=re_your_api_key_here
FROM_EMAIL=care@kiora.care
TARGET_EMAIL=sanjusazid0@gmail.com
PORT=3001
DATABASE_URL=postgresql://user:password@host:5432/database
ALLOWED_ORIGIN=*
```

### 3. Resend API Key Setup

**Option 1: Use existing AWS ECS key**
- If deploying to AWS ECS, the `RESEND_API_KEY` is already configured in your ECS task definition
- Value: `re_ER61dsiM_53SzCuWrGJFPvmYEeaKDK6aw`

**Option 2: Get new key**
1. Sign up at [Resend](https://resend.com)
2. Go to API Keys section
3. Create a new API key
4. Add it to `RESEND_API_KEY` in `.env`

### 4. Database Setup (Optional)

If you want to store form submissions in PostgreSQL:
- Set `DATABASE_URL` in `.env`
- The table `form_submissions` will be created automatically on first run
- If `DATABASE_URL` is not set, emails will still work but submissions won't be saved

### 5. Start Server

```bash
# Production
npm start

# Development (with auto-reload)
npm run dev
```

Server will run on `http://localhost:3001`

## API Endpoints

### Health Check
```
GET /api/health
```

### Send Email (Contact Form / Schedule Test)
```
POST /api/send-contact-email
Content-Type: application/json

{
  "formType": "contact" | "schedule-test",
  "userType": "patient" | "doctor",
  "fullName": "John Doe",
  "emailAddress": "john@example.com",
  "phoneNumber": "+1234567890",
  "city": "City Name",
  "pincode": "123456",
  "message": "Optional message",
  "agreeToContact": true,
  "selectedPlan": "one-time" | "90-days" // Only for schedule-test
}
```

## Testing

```bash
# Test the API
npm test
```

Or manually test with curl:

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
    "message": "Test message",
    "agreeToContact": true,
    "selectedPlan": "one-time"
  }'
```

## Email Templates

### Notification Email (to Business)
- Includes all form details
- Shows selected plan (if schedule-test)
- Formatted HTML email

### Confirmation Email (to Sender)
- Thank you message
- Submission details summary
- Plan information (if schedule-test)
- Professional branding

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `RESEND_API_KEY` | Yes | - | Resend API key for sending emails |
| `FROM_EMAIL` | No | `care@kiora.care` | Email address that appears as sender |
| `TARGET_EMAIL` | No | `sanjusazid0@gmail.com` | Business email for notifications |
| `PORT` | No | `3001` | Server port (use `8000` for AWS ECS) |
| `DATABASE_URL` | No | - | PostgreSQL connection string (optional) |
| `ALLOWED_ORIGIN` | No | `*` | CORS allowed origins |

## Database Schema

The backend automatically creates a `form_submissions` table with the following structure:

```sql
CREATE TABLE form_submissions (
  id SERIAL PRIMARY KEY,
  form_type VARCHAR(50) NOT NULL,
  user_type VARCHAR(50),
  full_name VARCHAR(255) NOT NULL,
  email_address VARCHAR(255) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  city VARCHAR(255),
  pincode VARCHAR(20),
  message TEXT,
  selected_plan VARCHAR(50),
  agree_to_contact BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Indexes are automatically created on:
- `email_address`
- `created_at`
- `form_type`

## Deployment

### AWS ECS (Recommended)

Your backend is already configured for AWS ECS! The ECS task definition includes:
- `RESEND_API_KEY` - Already set in environment variables
- `DATABASE_URL` - PostgreSQL connection string
- `PORT` - Set to 8000

**To deploy:**
1. Build Docker image with your updated `server.js`
2. Push to ECR: `446045858077.dkr.ecr.us-east-1.amazonaws.com/kiora-ckd-production-backend`
3. Update ECS service to use new image
4. Environment variables are already configured in task definition

### Other Platforms

**Vercel / Railway / Render:**
1. Set environment variables (`RESEND_API_KEY`, `DATABASE_URL`, etc.)
2. Deploy the `server.js` file
3. Make sure `PORT` is set correctly (most platforms set this automatically)

**Traditional Server:**
1. Install Node.js (v18+)
2. Clone repository
3. Run `npm install`
4. Set up `.env` file
5. Run `npm start` or use PM2: `pm2 start server.js`
