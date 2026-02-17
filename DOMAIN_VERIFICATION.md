# Domain Verification Guide

## Why This Error?

Resend requires domain verification when sending emails from custom domains like `care@kiora.care`. This is a security measure to prevent spam.

## Quick Fix (For Testing)

**Use Resend's default verified domain:**
```env
FROM_EMAIL=onboarding@resend.dev
```

This works immediately without any setup!

## For Production (Use care@kiora.care)

### Step 1: Verify Domain in Resend

1. Go to https://resend.com/domains
2. Click **"Add Domain"**
3. Enter: `kiora.care`
4. Resend will provide DNS records to add

### Step 2: Add DNS Records

Add these DNS records to your domain registrar (where you manage kiora.care):

**SPF Record:**
```
Type: TXT
Name: @ (or kiora.care)
Value: v=spf1 include:resend.com ~all
```

**DKIM Records:**
Resend will provide 2-3 DKIM records. Add them as:
```
Type: CNAME
Name: [provided by Resend]
Value: [provided by Resend]
```

**DMARC Record (Optional but recommended):**
```
Type: TXT
Name: _dmarc
Value: v=DMARC1; p=none; rua=mailto:dmarc@kiora.care
```

### Step 3: Wait for Verification

- DNS changes can take 24-48 hours to propagate
- Resend will verify automatically
- Check status at https://resend.com/domains

### Step 4: Update .env

Once verified:
```env
FROM_EMAIL=care@kiora.care
```

## Alternative: Use Your Gmail

If you want to use your Gmail address:

1. Go to https://resend.com/domains
2. Click **"Add Domain"** → **"Use Gmail"**
3. Follow the verification steps
4. Then use: `FROM_EMAIL=your-email@gmail.com`

## Current Setup

For now, your `.env` is set to use `onboarding@resend.dev` which works immediately for testing. Emails will be sent from this address until you verify your domain.
