# Caledonian Mercury: Community Curation & Citizen Journalism

A modern, social community-curated news platform for Scottish politics, business, and culture. The app features structured upvoting/downvoting, citizen-submitted links, and character-constrained citizen opinion micro-articles instead of traditional comment sections.

---

## 🏗 Project Architecture

* **Frontend (PWA)**: Located in the `frontend/` directory, deployed via Firebase Hosting. Uses a modern, high-precision feed reader optimized for mobile and desktop screens.
* **Sync Daemon**: Located in `backend/firebase_sync.py`, processes RSS feed ingestion, scrapes user submissions, and runs NLP tasks (JTI, Named Entities, and Sentiment Analysis).
* **Database**: Firestore. Security rules ensure only authorized monitors can curate, while readers can submit links, vote, and write micro-opinions.

---

## 🚀 Local Operations

To run the sync daemon locally, activate the virtual environment and choose a command:

```bash
# Activate Virtual Environment
source venv/bin/activate

# Scrape RSS feeds and push new staged articles
python3 backend/firebase_sync.py push

# Run the continuous daemon loop (processes submissions & accepted story NLP)
python3 backend/firebase_sync.py listen

# Run a single-pass sync (scrapes, processes submissions, runs NLP, and exits)
python3 backend/firebase_sync.py cron
```

---

## ☁ Serverless Sync (GitHub Actions)

We have configured a GitHub Actions workflow in `.github/workflows/sync.yml`. When pushed to GitHub, this runs the `cron` command hourly to scrape new stories and process pending submissions completely for free.

---

## 🛠 Pushing to your GitHub Account

To upload this repository to GitHub so the Actions workflow runs:

1. Create a new repository named `caledonian-mercury` on your GitHub account ([github.com/new](https://github.com/new)).
2. Run these commands in your project root terminal to connect and push:
   ```bash
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/caledonian-mercury.git
   git branch -M main
   git push -u origin main
   ```
