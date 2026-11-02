// BetterAuth configuration for StudioSpace.
//
// Design (kept intentionally small and explicit):
// - Primary database is MongoDB via the official MongoDB adapter, using the
//   raw Db object exposed by db.js (getDb()). When no MongoDB is connected
//   (no/unreachable MONGODB_URI), BetterAuth falls back to its in-memory
//   adapter so the server still starts for local development — exactly like
//   the old in-memory store fallback. Sessions created in fallback mode do
//   NOT persist across restarts; set MONGODB_URI for production.
// - The in-memory fallback MUST pass pre-initialised tables to
//   memoryAdapter ({ user: [], session: [], account: [], verification: [] });
//   calling memoryAdapter() with no argument crashes on the first lookup
//   ("Cannot read properties of undefined (reading 'user')").
// - Email/password auth is enabled with minPasswordLength 6. The extra
//   uppercase/lowercase rule is NOT a BetterAuth option, so it is enforced
//   in the /api/auth/register shim in index.js (and already in the client
//   register form) before delegating to BetterAuth.
// - Google is only configured when GOOGLE_CLIENT_ID and
//   GOOGLE_CLIENT_SECRET are both set. Otherwise the social provider is
//   omitted and GET /api/auth/google returns a clear 500 JSON (see index.js).
//   BetterAuth's callback is /api/auth/callback/google — NOT the old
//   /api/auth/google/callback — so the Google Cloud Console redirect URI
//   must be updated to <SERVER_URL>/api/auth/callback/google.
// - Session cookie: BetterAuth's default "better-auth.session_token"
//   (httpOnly, 7 days). In production it is SameSite=None + Secure so a
//   Vercel client can use a Render server cross-site; locally it is
//   SameSite=Lax (both on localhost, so same-site).
const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { memoryAdapter } = require("better-auth/adapters/memory");

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function createAuth({ db, clientUrl, serverUrl }) {
  const production = isProduction();
  const socialProviders = googleConfigured()
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        },
      }
    : {};
  const auth = betterAuth({
    secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || "studiospace-dev-secret-change-me",
    baseURL: serverUrl,
    trustedOrigins: [...new Set([clientUrl, "http://localhost:3000"])].filter(Boolean),
    database: db
      ? mongodbAdapter(db)
      : memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 6,
    },
    socialProviders,
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days, same as the old JWT lifetime
      updateAge: 60 * 60 * 24, // 1 day
    },
    advanced: {
      useSecureCookies: production,
      // The OAuth state cookie is NOT covered by the session_token override
      // below: BetterAuth creates it with SameSite=Lax by default. The BA
      // client signs in via a cross-site POST (Vercel -> Render), so a Lax
      // state cookie is never persisted by the browser and Google's callback
      // fails with "State mismatch: State not persisted correctly" (seen live
      // 2 Nov 2026, even after NODE_ENV=production). Force every auth cookie
      // — including the state cookie — to SameSite=None + Secure in
      // production, so the cross-site POST can persist it, exactly like the
      // session cookie that already works for email login.
      defaultCookieAttributes: {
        sameSite: production ? "none" : "lax",
        secure: production,
      },
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            path: "/",
            sameSite: production ? "none" : "lax",
            secure: production,
          },
        },
        state: {
          attributes: {
            httpOnly: true,
            path: "/",
            sameSite: production ? "none" : "lax",
            secure: production,
          },
        },
      },
    },
  });
  return auth;
}

// Build a WHATWG Headers object from an Express request. BetterAuth's
// server API (getSession, signInEmail, signUpEmail, signOut, signInSocial)
// reads the session cookie from these headers. If the browser/curl caller
// sent no Origin, fall back to the client URL so the internal call is not
// rejected with MISSING_OR_NULL_ORIGIN; the browser always sends Origin.
function headersFromReq(req, clientUrl) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers || {})) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
  }
  if (!headers.get("origin") && clientUrl) headers.set("origin", clientUrl);
  return headers;
}

// Shape the BetterAuth user into the shape the client already expects:
// { id, name, email, photo } (BetterAuth calls the photo field "image").
function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    photo: user.image || "",
  };
}

async function getSessionUser(req, auth, clientUrl) {
  if (!auth) return null;
  const session = await auth.api.getSession({ headers: headersFromReq(req, clientUrl) });
  if (!session || !session.user) return null;
  return { session, user: session.user };
}

function validatePassword(password) {
  if (!password || password.length < 6)
    return "Password must be at least 6 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  return null;
}

module.exports = {
  createAuth,
  googleConfigured,
  headersFromReq,
  publicUser,
  getSessionUser,
  validatePassword,
};
