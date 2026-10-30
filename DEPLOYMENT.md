# Deploying the server on Render
1. Push this repo to GitHub.
2. Create a Render Web Service from the repo, build command `npm install`, start command `npm start`.
3. Set env vars: MONGODB_URI, JWT_SECRET, CLIENT_URL (your Vercel URL), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SERVER_URL (your Render URL).
4. Register `<SERVER_URL>/api/auth/google/callback` in Google Cloud Console before testing Google login.
