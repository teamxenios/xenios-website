# Deployment Guide

This project is configured as a Full-Stack application (Vite Frontend + Express Backend). You have two main deployment options on Replit.

## Option 1: Replit Autoscale / Reserved VM (Recommended)

This method deploys the full application, including the Express server which serves the frontend and handles any potential backend logic.

1.  **Open the Deploy Tab**: Click the "Deploy" button in the top right of the Replit editor.
2.  **Select Deployment Type**: Choose "Autoscale" (easiest) or "Reserved VM".
3.  **Configure Build Settings**:
    *   **Build Command**: `npm run build`
    *   **Run Command**: `npm start`
4.  **Deploy**: Click "Deploy" and wait for the process to finish.

**Why this works:**
*   `npm run build` runs `script/build.ts`, which builds the client to `dist/public` and bundles the server to `dist/index.cjs`.
*   `npm start` runs the bundled server in production mode.

---

## Option 2: Static Site Deployment

If you *only* need the frontend (and have no backend API logic), you can deploy as a static site. This is often cheaper and faster for pure marketing sites.

1.  **Open the Deploy Tab**.
2.  **Select Deployment Type**: Choose "Static".
3.  **Configure Build Settings**:
    *   **Build Command**: `npm run build`
    *   **Public Directory**: `dist/public`
4.  **Deploy**.

**Note:** This works because the build script outputs the compiled HTML/CSS/JS to `dist/public`.

## Custom Domains

To add a custom domain (e.g., `www.your-site.com`):

1.  Go to the **Settings** of your active deployment.
2.  Find the **Custom Domains** section.
3.  Enter your domain name.
4.  Follow the instructions to update your DNS records (adding a CNAME record pointing to Replit).
5.  Wait for SSL certificate provisioning (automatic).

## Troubleshooting

*   **Port Issues**: The application is configured to bind to `0.0.0.0` (standard for Replit) and uses `process.env.PORT` or defaults to 5000. This is handled automatically.
*   **Environment Variables**: If you add API keys (e.g., for Airtable/Mailchimp later), ensure you add them in the **Secrets** tool in the Replit editor *and* redeploy for them to take effect.
