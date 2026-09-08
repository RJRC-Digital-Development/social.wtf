# Deployment Guide: Social.wtf on Cookie Chain

This guide details how to deploy Social.wtf to a live, publicly accessible URL to satisfy **Phase 5** submission requirements.

---

## ⚡ 1. One-Click Vercel Deployment (Recommended)

1. **Push Code to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: Social.wtf Web3 ecosystem on Cookie Chain"
   git remote add origin https://github.com/your-username/social.wtf.git
   git push -u origin main
   ```

2. **Deploy on Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new) and import your repository `social.wtf`.
   - Next.js is automatically detected with framework preset: **Next.js**.
   - Set the Build Command: `npm run build`
   - Output Directory: `.next`
   - Click **Deploy**.

3. **Live URL**:
   Your live application will be instantly available at `https://social-wtf.vercel.app` (or your custom domain).

---

## 🌐 2. Netlify Deployment

1. Go to [app.netlify.com](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project**.
3. Select your GitHub repository.
4. Settings:
   - Build command: `npm run build`
   - Publish directory: `.next`
5. Click **Deploy Social.wtf**.

---

## 🖥️ 3. Self-Hosted VPS / Docker

If running on your own VPS (Ubuntu/Debian):

```bash
# Clone and build
git clone https://github.com/thepros2014/social.wtf.git
cd social.wtf
npm install
npm run build

# Run with PM2 daemon
npm install -g pm2
pm2 start npm --name "social-wtf" -- start -- -p 3000
```

Setup Nginx reverse proxy to port 3000 with Let's Encrypt SSL.
