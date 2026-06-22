# Tomsmosse Donations Website

A professional donation website built with HTML, CSS, JavaScript, and a Node.js backend for Lipana M-Pesa integration.

## Features
- Three-page responsive website: Home, About, Donate
- Clean modern layout with professional visual design
- Lipana STK Push integration for real M-Pesa payments
- Interactive donation experience with form validation and toast feedback
- Easy deployment to `https://tomsmosse.site.je/`

## Setup
1. Copy `.env.example` to `.env`
2. Add your Lipana API key to `LIPANA_API_KEY`
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the site:
   ```bash
   npm start
   ```

## Lipana Integration
The server uses the official Lipana SDK and expects a production or sandbox key in `LIPANA_API_KEY`.
When running locally, the site serves static files and routes the donation request through `/api/pay`.

## Payment Database
Payments are saved in PostgreSQL when `DATABASE_URL` is set. This keeps payment records available even after Render restarts or redeploys the app.

On Render:
1. Open the Render dashboard.
2. Create a new PostgreSQL database.
3. Copy the database's internal connection string.
4. Open this web service's Environment settings.
5. Add an environment variable named `DATABASE_URL` with that connection string.
6. Redeploy the web service.

The app creates the `payments` table automatically on startup. If `DATABASE_URL` is missing, the app still runs, but payments use temporary memory storage for local development only.

## Deploying to your domain
Deploy the project to a hosted Node.js environment or static site hosting with backend support. Point your domain `https://tomsmosse.site.je/` to the deployed app.
