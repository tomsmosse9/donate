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

## Deploying to your domain
Deploy the project to a hosted Node.js environment or static site hosting with backend support. Point your domain `https://tomsmosse.site.je/` to the deployed app.
