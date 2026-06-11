# 🏀 HoopCast — Basketball Over/Under Predictions

> Plain-English setup guide. No coding experience needed.

---

## How This App Works (Simple Explanation)

Think of it like this:

- **GitHub** = your server, your database, and your automation engine. It stores everything and runs the daily robot.
- **Vercel** = just the TV screen. It shows your website to the world. That's all it does.
- Every day at 3 AM Nigeria time, GitHub automatically wakes up, collects basketball data, runs the predictions, saves the results into your GitHub account, and goes back to sleep.
- When someone visits your website, Vercel reads those saved results from GitHub and displays them.

**Cost: $0. Forever.**

---

## STEP-BY-STEP SETUP

---

### STEP 1 — Create a GitHub Account (if you don't have one)

1. Go to **github.com**
2. Click **Sign up**
3. Choose a username, enter your email, create a password
4. Verify your email address
5. You're in

---

### STEP 2 — Upload This App to GitHub

1. Log in to **github.com**
2. Click the **+** button at the top right → click **New repository**
3. Name it: `hoopcast` (lowercase, no spaces)
4. Make sure it is set to **Public**
5. Click **Create repository**
6. Now you have an empty repository

Next, upload the files:

1. On your new empty repository page, click **uploading an existing file** (you'll see this link)
2. Drag and drop ALL the files from the zip you downloaded into the box
   - Make sure you upload the folders too (api, lib, public, scripts, .github)
   - GitHub lets you drag entire folders
3. Scroll down and click **Commit changes**

Your files are now on GitHub. ✅

---

### STEP 3 — Create a GitHub Personal Access Token

This is like a password that lets the app save data into your own GitHub account.

1. Go to **github.com** → click your profile picture (top right) → **Settings**
2. Scroll all the way down the left menu → click **Developer settings**
3. Click **Personal access tokens** → click **Tokens (classic)**
4. Click **Generate new token** → **Generate new token (classic)**
5. In the "Note" box, type: `HoopCast Token`
6. Set expiration to **No expiration**
7. Under "Select scopes", tick the box next to **repo** (this lets it read/write your files)
8. Scroll down → click **Generate token**
9. You will see a token that starts with `ghp_...`
10. **COPY IT NOW** — you will never see it again. Paste it in Notepad for a moment.

---

### STEP 4 — Add Your Secrets to GitHub

Secrets are like private settings that only the robot can see.

1. Go to your `hoopcast` repository on GitHub
2. Click **Settings** (the tab at the top of the repo)
3. In the left menu, click **Secrets and variables** → click **Actions**
4. Click **New repository secret** — you will add these one by one:

| Secret Name | What to put in the Value box |
|-------------|------------------------------|
| `GITHUB_OWNER` | Your GitHub username (e.g. `john-doe`) |
| `GITHUB_REPO` | `hoopcast` |
| `PIPELINE_TOKEN` | The `ghp_...` token you copied in Step 3 |
| `API_BASKETBALL_KEY` | Leave blank for now (optional, for more leagues) |

For each one:
- Click **New repository secret**
- Type the Name exactly as shown
- Paste the Value
- Click **Add secret**

---

### STEP 5 — Connect Vercel (The Website Display)

1. Go to **vercel.com**
2. Click **Sign up** → choose **Continue with GitHub** (use the same GitHub account)
3. Click **Add New** → **Project**
4. You will see your `hoopcast` repository listed → click **Import**
5. Vercel will show some settings — you don't need to change anything
6. Click **Deploy**
7. Wait about 1 minute
8. Vercel will give you a link like `hoopcast.vercel.app` — that's your website! 🎉

Now add the same secrets to Vercel so the API works:

1. In Vercel, go to your project → click **Settings** → click **Environment Variables**
2. Add these one by one (same values as Step 4):

| Name | Value |
|------|-------|
| `GITHUB_OWNER` | Your GitHub username |
| `GITHUB_REPO` | `hoopcast` |
| `GITHUB_TOKEN` | The `ghp_...` token from Step 3 |
| `TZ` | `Africa/Lagos` |

3. After adding them, click **Redeploy** → **Redeploy** to apply the settings

---

### STEP 6 — Run It for the First Time

The robot runs automatically at 3 AM Nigeria time every day. But you can also run it right now manually to see it work.

1. Go to your `hoopcast` repository on GitHub
2. Click the **Actions** tab (near the top)
3. On the left, click **HoopCast Daily Pipeline**
4. Click the **Run workflow** button on the right
5. Leave the date blank → click the green **Run workflow** button
6. You'll see a yellow circle — it means it's running
7. Wait 2–5 minutes
8. If it turns green ✅ — success! Visit your website and you'll see predictions.
9. If it turns red ❌ — click on it to see the error message, then check Steps 3 and 4 again

---

### STEP 7 — Visit Your Website

Go to the Vercel link from Step 5 (e.g. `hoopcast.vercel.app`).

You should see:
- Today's basketball predictions with colour-coded confidence
- Filters for league and date
- History and accuracy tabs

**The robot will now run itself every single day at 3 AM Nigeria time. You never have to touch anything again.**

---

## OPTIONAL: Get More Leagues (Beyond NBA)

The app covers the NBA for free with no setup. To get 100+ more global leagues:

1. Go to **rapidapi.com** and create a free account
2. Search for **API-Basketball**
3. Subscribe to the free plan (100 requests/day — enough)
4. Copy your API key
5. Go back to GitHub → your repo → **Settings** → **Secrets** → add:
   - Name: `API_BASKETBALL_KEY`
   - Value: your key
6. Do the same in Vercel → **Settings** → **Environment Variables**
7. Run the pipeline manually again (Step 6)

---

## Something Went Wrong?

| Problem | Fix |
|---------|-----|
| Website shows nothing | Run the pipeline manually first (Step 6) |
| Actions tab shows red | Re-check your secrets in Step 4 — most common issue is a typo |
| Token not working | Create a new token in Step 3 and replace `PIPELINE_TOKEN` |
| Vercel shows error | Re-check environment variables in Vercel (Step 5) |

---

## What GitHub Stores (Automatically, In Your Repo)

After the robot runs, you'll see a `data/` folder appear in your GitHub repo with files like:
- `predictions/2025-06-06.json` — today's predictions
- `history.json` — all past results
- `league-accuracy.json` — how accurate each league's predictions are

You never need to open these files. The website reads them automatically.

