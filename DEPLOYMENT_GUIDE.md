# TradePulse Deployment Guide

## Overview

Embedding the TradePulse Bitcoin dashboard into adderintegration.com requires deploying **3 components**:

```
┌─────────────────────────────────────────────────────────┐
│  adderintegration.com (Netlify)                         │
│  └── tradepulse.html  ← iframe points to Vercel app     │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  TradePulse Frontend (Vercel)     ← STEP 2              │
│  Next.js React app                                      │
│  https://[your-app].vercel.app                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  TradePulse API (Render)          ← STEP 1              │
│  Flask Python backend                                   │
│  https://[your-app].onrender.com                        │
└─────────────────────────────────────────────────────────┘
```

---

## Current Status

| Step | Component | Status | Notes |
|------|-----------|--------|-------|
| 1 | Render (Flask API) | 🟡 In Progress | Needs PYTHON_VERSION=3.11.0 fix |
| 2 | Vercel (Next.js) | ⬜ Not Started | Waiting for Render URL |
| 3 | Update tradepulse.html | ⬜ Not Started | Waiting for Vercel URL |
| 4 | Netlify auto-deploys | ⬜ Not Started | Will auto-deploy on push |

---

## Step 1: Deploy Flask API to Render (CURRENT)

### 1.1 Go to Render Dashboard
- URL: https://dashboard.render.com
- Select your web service (or create new one)

### 1.2 Configure Settings

**Build Command:**
```
pip install -r requirements.txt
```

**Start Command:**
```
gunicorn api_server:app --bind 0.0.0.0:$PORT
```

### 1.3 Set Environment Variables

In Render Dashboard → Environment → Add the following:

| Variable | Value | Required |
|----------|-------|----------|
| `SERVERLESS` | `true` | ✅ Yes |
| `PYTHON_VERSION` | `3.11.0` | ✅ Yes (must include patch) |
| `POLYGON_API_KEY` | your_key | ✅ Yes |
| `FMP_API_KEY` | your_key | ✅ Yes |
| `FINNHUB_API_KEY` | your_key | ✅ Yes |
| `NEWS_API_KEY` | your_key | Optional |
| `ANTHROPIC_API_KEY` | your_key | Optional (for Claude AI) |
| `XAI_API_KEY` | your_key | Optional (for Grok) |
| `GOOGLE_API_KEY` | your_key | Optional (for Gemini) |

### 1.4 Deploy and Get URL

After successful deploy, note your URL:
```
https://[your-service-name].onrender.com
```

Test it works:
```
https://[your-service-name].onrender.com/api/health
```

---

## Step 2: Deploy Next.js Frontend to Vercel

### 2.1 Go to Vercel
- URL: https://vercel.com/new
- Click "Import Project"

### 2.2 Import from GitHub
- Select repository: `tj309c/BTC_TJ`
- Click "Import"

### 2.3 Configure Project

| Setting | Value |
|---------|-------|
| **Framework Preset** | Next.js |
| **Root Directory** | `tradepulse` |
| **Build Command** | `npm run build` (default) |
| **Output Directory** | `.next` (default) |
| **Install Command** | `npm install` (default) |

### 2.4 Add Environment Variable

Click "Environment Variables" and add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_API_URL` | `https://[your-render-url].onrender.com` |

Replace `[your-render-url]` with your actual Render URL from Step 1.

### 2.5 Deploy

Click "Deploy" and wait for build to complete.

Note your Vercel URL:
```
https://[your-project].vercel.app
```

---

## Step 3: Update tradepulse.html with Vercel URL

### 3.1 Edit the file

Open: `ADDR_Website/tradepulse.html`

Find this line (around line 147):
```html
<iframe
    id="tradepulse-iframe"
    class="dashboard-iframe"
    src="https://your-tradepulse.vercel.app"
```

### 3.2 Replace with your Vercel URL

```html
<iframe
    id="tradepulse-iframe"
    class="dashboard-iframe"
    src="https://[your-actual-vercel-url].vercel.app"
```

### 3.3 Commit and Push

```bash
cd ADDR_Website
git add tradepulse.html
git commit -m "Update TradePulse iframe URL to production"
git push
```

---

## Step 4: Verify on Netlify

Netlify should auto-deploy when you push to GitHub.

### 4.1 Check Netlify Dashboard
- URL: https://app.netlify.com
- Verify deploy succeeded

### 4.2 Test the Live Site
- Go to: https://adderintegration.com/tradepulse.html
- Dashboard should load in the iframe

---

## Troubleshooting

### Render Issues

**Error: "PYTHON_VERSION must provide major, minor, and patch"**
- Fix: Change `3.11` to `3.11.0`

**Error: "ModuleNotFoundError"**
- Check requirements.txt is in repo root
- Verify build command runs `pip install -r requirements.txt`

**API returns errors**
- Check environment variables are set
- Test `/api/health` endpoint first

### Vercel Issues

**Build fails with module errors**
- Ensure Root Directory is set to `tradepulse`
- Check package.json exists in tradepulse folder

**API calls fail (CORS)**
- Verify NEXT_PUBLIC_API_URL is correct
- Check Render API is running

### Iframe Issues

**Blank iframe**
- Check browser console for errors
- Verify Vercel URL is correct
- Test Vercel URL directly in browser

**X-Frame-Options error**
- Vercel should allow iframe by default
- If blocked, may need to add headers config

---

## Quick Reference

### URLs to Configure

| Location | Variable/Setting | Value |
|----------|-----------------|-------|
| Render | `SERVERLESS` env var | `true` |
| Render | `PYTHON_VERSION` env var | `3.11.0` |
| Vercel | `NEXT_PUBLIC_API_URL` env var | Render URL |
| tradepulse.html | iframe `src` | Vercel URL |

### Test Endpoints

| Endpoint | Purpose |
|----------|---------|
| `[render-url]/api/health` | Check API is running |
| `[render-url]/api/bitcoin-price` | Check data fetching works |
| `[vercel-url]` | Check frontend loads |

---

## Files Modified

### BTC Repository (tj309c/BTC_TJ)
- `api_server.py` - Added SERVERLESS mode
- `requirements.txt` - Python dependencies (NEW)
- `render.yaml` - Render blueprint (NEW)
- `tradepulse/vercel.json` - Vercel config (NEW)
- `tradepulse/lib/api.ts` - Exported API_BASE_URL
- `tradepulse/components/**/*.tsx` - Fixed hardcoded URLs

### ADDR_Website Repository (tj309c/addrintegration-website)
- `tradepulse.html` - New dashboard page (NEW)
- `index.html` - Added TradePulse nav link
- `pricing.html` - Added TradePulse nav link
- `why-us.html` - Added TradePulse nav link
