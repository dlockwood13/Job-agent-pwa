# Job Agent — PWA Setup Guide

A mobile-first job search app for Assistant Psychologist roles. Installs to your home screen like a real app — no app store, no developer accounts, no Xcode.

---

## What you've got

```
job-agent-pwa/
├── index.html       ← the app
├── styles.css       ← styling
├── app.js           ← logic (search, save, alerts)
├── sw.js            ← service worker (offline + installability)
├── manifest.json    ← tells your phone "this is an installable app"
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## How PWAs work (30-second version)

A PWA is a website that *behaves* like a native app once installed: it gets its own icon, opens full-screen, works offline, and can send notifications. The magic comes from three files:

1. **`manifest.json`** — name, icon, colours
2. **`sw.js`** (service worker) — caches the app so it works offline
3. **HTTPS hosting** — PWAs **require** HTTPS (one exception: `localhost`)

That third one matters. You can't just open `index.html` from your hard drive — your phone won't treat it as installable.

---

## Three paths, easiest first

### Path 1: Test locally first (5 minutes, no internet host)

Run a local server, install to your laptop, see it work, then move to Path 2 or 3 to get it on your phone.

```bash
cd job-agent-pwa
python3 -m http.server 8000
```

Open `http://localhost:8000` in Chrome on your laptop. You'll see an install icon in the address bar.

**Catch:** your phone can't reach `localhost` on your laptop. This is just to confirm it works before publishing.

---

### Path 2: Free public hosting via Netlify Drop (5 minutes, recommended)

This is the fastest way to get a real URL you can open on your phone.

1. Go to **[app.netlify.com/drop](https://app.netlify.com/drop)**
2. Drag the entire `job-agent-pwa` folder onto the page
3. Wait ~30 seconds — you'll get a URL like `https://random-name-123.netlify.app`
4. Open that URL on your phone

That's it. No account required for the initial drop (though signing up lets you keep the URL stable).

---

### Path 3: GitHub Pages (10 minutes, free forever, stable URL)

If you want a permanent home with version control:

1. Make a free account at **[github.com](https://github.com)**
2. Create a new public repo called `job-agent`
3. Upload all the files (drag-and-drop on the web works fine)
4. Go to **Settings → Pages → Source → Deploy from branch → main → / (root) → Save**
5. Wait a minute, then visit `https://yourusername.github.io/job-agent/`

---

## Installing on your phone

Once the app is at a real HTTPS URL:

### iPhone (Safari)
1. Open the URL in **Safari** (not Chrome — iOS requires Safari for installing PWAs)
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **Add to Home Screen**
4. Tap **Add**

The app icon appears on your home screen. Tap it — opens full-screen, no browser chrome.

### Android (Chrome)
1. Open the URL in **Chrome**
2. You'll see a banner at the top: "Install Job Agent on your home screen" — tap **Install**
3. (Or: Chrome menu → **Install app**)

---

## ⚠ One important thing about the API

The app makes live calls to `api.anthropic.com` from your phone. By default this won't work because:

1. **CORS** — Anthropic's API blocks browser-origin requests for security
2. **API key** — the app currently assumes the key is handled "magically" (it's coded that way because it was originally built as a Claude artifact, where Anthropic handles the key)

**To make it actually work on your phone, you have two options:**

### Option A — Run it inside Claude artifacts only
Keep using the React version I built earlier. It works because Claude's artifact runtime provides the API key behind the scenes. This is the simplest option but means you can only access it through Claude.

### Option B — Add a tiny backend proxy
This is the proper way to ship a PWA that calls Anthropic's API. You set up a small server (Cloudflare Workers, Vercel, etc.) that holds your API key and forwards requests. Roughly:

1. Get an Anthropic API key from [console.anthropic.com](https://console.anthropic.com)
2. Deploy a one-file proxy (I can write this for you if you want)
3. Change one line in `app.js`:
   ```js
   const response = await fetch('YOUR_PROXY_URL', { ... })
   ```

This is the **real** path to a working mobile app. Just say the word and I'll build the proxy.

---

## Features that work right now

✓ **Search live listings** — ranked by fit to your background
✓ **Fit analysis modal** — tap any role for a candid breakdown
✓ **Save jobs** — tap the heart; stored on your device
✓ **Tabs** — Search / Saved / Alerts
✓ **Install to home screen** — looks and feels like a native app
✓ **Offline shell** — the app loads even without internet (just can't run new searches)
✓ **Local reminders** — opt-in daily nudge to check for new jobs

## Honest limits

✗ **True background push notifications** — would require a backend (see Option B)
✗ **Direct API calls without a proxy** — see above

---

## Quick next steps

Pick one:

- **"Get me running today"** → Path 2 (Netlify Drop) + Option A (use the React artifact for actual searching)
- **"Make it a proper standalone app"** → Path 3 (GitHub Pages) + Option B (I'll build the proxy)
- **"Just let me see it on my phone first"** → Path 2, install it, browse the UI — you'll see the layout and feel even without working searches

Reply with which path you want and I'll get you there.
