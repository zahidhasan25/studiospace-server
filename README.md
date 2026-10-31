# StudioSpace — Server

Express + MongoDB (native driver) API for **StudioSpace**, a peer-to-peer
creative workspace and production studio sharing platform. The Next.js client
talks to this server for authentication, studios, bookings and wishlist data.

## Features

- Email/password auth with BetterAuth + MongoDB adapter; session stored in an HTTPOnly cookie (`better-auth.session_token`)
- Google login via BetterAuth social provider (callback `/api/auth/callback/google`)
- Full studio CRUD with owner-only update/delete protection (403 for other users)
- Booking system with server-side price calculation and double-booking prevention
  (same studio + same date + overlapping time against Pending or Confirmed bookings)
- Booking cancel (booking owner, Pending only) and confirm (studio owner, Pending only)
- Saved studios wishlist (idempotent save, returns full studio objects)
- Seed data: 12 realistic studios across all 5 categories, plus an examiner demo user
- Graceful fallback: if `MONGODB_URI` is missing or unreachable, the server still
  runs with an in-memory store (seeded the same way) instead of crashing; BetterAuth then uses its in-memory adapter, so sessions do not persist across restarts

## Tech Stack

- Node.js, Express (JavaScript, CommonJS)
- MongoDB native driver (`mongodb` package) — no ODM
- `better-auth` (+ MongoDB adapter), `cookie-parser`, `cors`, `dotenv`

## Local Setup

```bash
cd studiospace-server
npm install
cp .env.example .env
# Edit .env: set MONGODB_URI, BETTER_AUTH_SECRET (or JWT_SECRET as fallback), CLIENT_URL (and Google keys if you use Google login)
npm start
```

The server runs on `http://localhost:5000` by default (`PORT` env var).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No (default `5000`) | Port the server listens on |
| `MONGODB_URI` | No — falls back to memory | MongoDB connection string (Atlas or local) |
| `BETTER_AUTH_SECRET` | No in dev, yes in production | BetterAuth session secret (preferred) |
| `JWT_SECRET` | No | Fallback secret if BETTER_AUTH_SECRET is unset |
| `CLIENT_URL` | No (default `http://localhost:3000`) | Client origin for CORS + Google redirect target |
| `SERVER_URL` | No (defaults to request host) | Public server URL, used as the Google OAuth redirect base |
| `GOOGLE_CLIENT_ID` | For Google login | Google Cloud OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Google login | Google Cloud OAuth client secret |
| `NODE_ENV` | No | Set to `production` for `SameSite=None; Secure` cookies |

Google OAuth notes: in Google Cloud Console, add
`<SERVER_URL>/api/auth/callback/google` as an authorized redirect URI.
(This changed from the old custom flow's `/api/auth/google/callback`.)
If the Google keys are missing, `GET /api/auth/google` returns a clear 500 JSON
error instead of crashing.

## Examiner Test Credentials

- Email: `examiner@studiospace.test`
- Password: `Examiner123`

This user is created automatically on server startup through BetterAuth's sign-up API (never a hand-written bcrypt hash — BetterAuth uses its own password format). Any visitor can also register a new account
(password: at least 6 characters, one uppercase, one lowercase).

## API Endpoints

Auth (BetterAuth session is read from the HTTPOnly `better-auth.session_token` cookie only):

- `GET /api/health` — `{ ok: true }`
- `POST /api/auth/register` — `{ name, email, photo, password }`, sets cookie, 400 on duplicate email or weak password
- `POST /api/auth/login` — `{ email, password }`, sets cookie, 401 on bad credentials
- `POST /api/auth/logout` — clears the cookie
- `GET /api/auth/me` — auth required, 401 without a valid cookie
- `GET /api/auth/google` — starts Google login via BetterAuth (500 JSON if Google keys are missing)
- `GET /api/auth/callback/google` — BetterAuth's Google callback (handled by BetterAuth, not a custom route)
- BetterAuth native endpoints are also available under `/api/auth/*` (sign-in/email, sign-up/email, get-session, sign-out)

Studios (reads public; all mutations require auth, 401 without a valid cookie):

- `GET /api/studios?category=&search=&limit=` — newest first; search matches title, location, category
- `GET /api/studios/:id`
- `POST /api/studios` — owner fields are forced from the token user
- `PUT /api/studios/:id` — owner only (403 otherwise)
- `DELETE /api/studios/:id` — owner only (403 otherwise)
- `GET /api/my-listings` — auth required, studios where `ownerEmail` matches the token email

Bookings (all auth required):

- `POST /api/bookings` — `{ studioId, date, startTime, endTime }`; hours and total price are computed server-side from the studio hourly rate; overlapping Pending/Confirmed bookings on the same studio and date are rejected with 400
- `GET /api/bookings` — bookings of the token user, newest first
- `PATCH /api/bookings/:id/cancel` — booking owner only, Pending only
- `PATCH /api/bookings/:id/confirm` — studio owner only, Pending only

Wishlist (all auth required):

- `GET /api/wishlist` — full studio objects saved by the token user
- `POST /api/wishlist` — `{ studioId }`, idempotent
- `DELETE /api/wishlist/:studioId`

Studio categories: Photo Studio, Film Stage, Podcast Lounge, Music Suite, Workshop.
Booking statuses: Pending, Confirmed, Completed, Cancelled.
