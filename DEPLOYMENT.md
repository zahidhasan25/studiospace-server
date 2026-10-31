# Deploying the server on Render (BetterAuth branch)
1. Push this branch to GitHub (do NOT merge it to main until the BetterAuth
   flow has been verified live — see the branch notes in README.md).
2. Create a Render Web Service from the repo, build command `npm install`, start command `npm start`.
3. Set env vars: MONGODB_URI (required for persistent BetterAuth sessions —
   without it the server falls back to in-memory auth and sessions are lost
   on restart), BETTER_AUTH_SECRET (or JWT_SECRET as fallback), CLIENT_URL
   (your Vercel URL), GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SERVER_URL
   (your Render URL).
4. IMPORTANT — Google callback changed: BetterAuth's callback is
   `<SERVER_URL>/api/auth/callback/google`, NOT the old
   `<SERVER_URL>/api/auth/google/callback`. Register the new URL in Google
   Cloud Console (Authorized redirect URIs) before testing Google login,
   and keep the old URL only until every deployment runs this branch.
5. If Google keys are missing, `GET /api/auth/google` returns a clear 500
   JSON error; email/password login still works.
