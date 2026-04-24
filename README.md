# Math Worksheet Generator

An AI-powered worksheet generator for O-Level & A-Level Math tuition.
Upload sample questions (image, PDF, or Word doc) or describe what you want — get a downloadable Word doc instantly.

---

## Setup & Deployment Guide

### Step 1 — Get an Anthropic API Key
1. Go to https://console.anthropic.com
2. Sign up / log in
3. Go to **API Keys** → click **Create Key**
4. Copy the key (starts with `sk-ant-...`)

---

### Step 2 — Put the code on GitHub
1. Go to https://github.com and sign up / log in
2. Click **New repository** (top right, + icon)
3. Name it `math-worksheet-generator`, set to **Public**, click **Create**
4. On your computer, open Terminal (Mac) or Command Prompt (Windows)
5. Run these commands one by one:

```bash
cd path/to/mathgen          # navigate to this folder
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/math-worksheet-generator.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

---

### Step 3 — Deploy to Vercel (free)
1. Go to https://vercel.com and sign up with your GitHub account
2. Click **Add New → Project**
3. Find and select your `math-worksheet-generator` repo → click **Import**
4. Under **Environment Variables**, add:
   - Name: `ANTHROPIC_API_KEY`
   - Value: your key from Step 1
5. Click **Deploy**
6. Wait ~1 minute → you'll get a URL like `math-worksheet-generator.vercel.app`

That's it! Share the URL with anyone.

---

## Local Development (optional)
```bash
npm install
cp .env.example .env.local
# Edit .env.local and paste your API key
npm run dev
# Open http://localhost:3000
```

---

## Usage
1. Select level and number of questions
2. Choose difficulty mix
3. Upload a sample worksheet (photo, PDF, or Word doc) — handwritten is fine!
4. Add a description of what you want
5. Click Generate — Word doc downloads automatically
