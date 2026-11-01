require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { toNodeHandler } = require("better-auth/node");
const { connect, collection, isUsingMongo, getDb } = require("./db");
const { SEED_STUDIOS } = require("./seed");
const {
  createAuth,
  googleConfigured,
  headersFromReq,
  publicUser,
  getSessionUser,
  validatePassword,
} = require("./auth");

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
const SERVER_URL = (process.env.SERVER_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
// Assigned in start() after connect(), once a Db (or the in-memory
// fallback) is available. Routes read it at request time, so the
// BetterAuth handler below must also read it lazily.
let auth = null;
const CATEGORIES = ["Photo Studio", "Film Stage", "Podcast Lounge", "Music Suite", "Workshop"];

const allowedOrigins = [...new Set([CLIENT_URL, "http://localhost:3000"])].filter(Boolean);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(cookieParser());

// Session cookie names: BetterAuth uses "better-auth.session_token";
// "studiospace_token" is only cleared on logout for users migrating from
// the old custom-JWT version.
const SESSION_COOKIE = "better-auth.session_token";
const LEGACY_COOKIE = "studiospace_token";

async function authRequired(req, res, next) {
  if (!auth) return res.status(500).json({ message: "Authentication is not configured on the server." });
  try {
    const result = await getSessionUser(req, auth, CLIENT_URL);
    if (!result) return res.status(401).json({ message: "Unauthorized: please log in first." });
    req.user = publicUser(result.user);
    req.session = result.session;
    return next();
  } catch (err) {
    console.error("auth check error:", err);
    return res.status(401).json({ message: "Unauthorized: session is invalid or expired." });
  }
}

// Forward a BetterAuth asResponse Response to Express: copy its
// set-cookie header(s) and return its JSON body, mapping BetterAuth's
// duplicate-user 422 to the 400 the client already handles.
async function forwardBetterAuthResponse(betterRes, expressRes, successStatus, successBody) {
  const setCookie = betterRes.headers.getSetCookie
    ? betterRes.headers.getSetCookie()
    : betterRes.headers.get("set-cookie")
      ? [betterRes.headers.get("set-cookie")]
      : [];
  if (setCookie.length) expressRes.setHeader("set-cookie", setCookie);
  let body = null;
  try {
    body = await betterRes.json();
  } catch {
    body = null;
  }
  if (!betterRes.ok) {
    let message = (body && body.message) || "Authentication failed.";
    let status = betterRes.status;
    if (body && body.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
      status = 400;
      message = "An account with this email already exists.";
    }
    if (body && body.code === "INVALID_EMAIL_OR_PASSWORD") {
      status = 401;
      message = "Invalid email or password.";
    }
    return expressRes.status(status).json({ message });
  }
  return expressRes.status(successStatus).json(successBody(body));
}

function toMinutes(time) {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(time || ""));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function normalizeAmenities(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  if (typeof value === "string")
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  return [];
}

function normalizeStudioInput(body) {
  const images = Array.isArray(body.images)
    ? body.images.map((v) => String(v).trim()).filter(Boolean)
    : [];
  const image = String(body.image || images[0] || "").trim();
  if (image && !images.includes(image)) images.unshift(image);
  return {
    title: String(body.title || "").trim(),
    category: String(body.category || "").trim(),
    hourlyRate: Number(body.hourlyRate),
    deposit: Number(body.deposit || 0),
    capacity: Number(body.capacity || 1),
    location: String(body.location || "").trim(),
    image,
    images,
    amenities: normalizeAmenities(body.amenities),
    overview: String(body.overview || "").trim(),
  };
}

// ---------- Health / root ----------
app.get("/", (req, res) => {
  res.json({ message: "StudioSpace server is running.", ok: true, db: isUsingMongo() ? "mongodb" : "memory" });
});
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ---------- Auth (BetterAuth) ----------
// Compatibility contract, unchanged for the client:
//   POST /api/auth/register -> 201 { message, user } (validates the
//     uppercase/lowercase password rule, then delegates to BetterAuth)
//   POST /api/auth/login    -> 200 { message, user }
//   POST /api/auth/logout   -> 200 { message } (clears the session cookie)
//   GET  /api/auth/me       -> 200 { user: { id, name, email, photo } }
//   GET  /api/auth/google   -> 500 JSON if Google is unconfigured, else
//     redirects to Google via BetterAuth's social flow.
// BetterAuth's own native endpoints (sign-in/email, sign-up/email,
// get-session, sign-out, callback/google, ...) are mounted below, after
// these compat routes, so compat routes win on their exact paths.
// The session cookie is now "better-auth.session_token" (httpOnly),
// not the old "studiospace_token" JWT cookie.
app.post("/api/auth/register", async (req, res) => {
  try {
    if (!auth) return res.status(500).json({ message: "Authentication is not configured on the server." });
    const { name, email, photo, password } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required." });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });
    const betterRes = await auth.api.signUpEmail({
      body: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        password,
        image: String(photo || "").trim() || undefined,
      },
      headers: headersFromReq(req, CLIENT_URL),
      asResponse: true,
    });
    return forwardBetterAuthResponse(betterRes, res, 201, (body) => ({
      message: "Registration successful.",
      user: publicUser(body.user),
    }));
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!auth) return res.status(500).json({ message: "Authentication is not configured on the server." });
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required." });
    const betterRes = await auth.api.signInEmail({
      body: { email: String(email).trim().toLowerCase(), password },
      headers: headersFromReq(req, CLIENT_URL),
      asResponse: true,
    });
    return forwardBetterAuthResponse(betterRes, res, 200, (body) => ({
      message: "Login successful.",
      user: publicUser(body.user),
    }));
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    if (auth) {
      const betterRes = await auth.api.signOut({
        headers: headersFromReq(req, CLIENT_URL),
        asResponse: true,
      });
      const setCookie = betterRes.headers.getSetCookie
        ? betterRes.headers.getSetCookie()
        : betterRes.headers.get("set-cookie")
          ? [betterRes.headers.get("set-cookie")]
          : [];
      if (setCookie.length) res.setHeader("set-cookie", setCookie);
    }
  } catch (err) {
    console.error("logout error:", err);
  }
  // Belt and braces: clear both the BetterAuth cookie and the legacy JWT
  // cookie so no stale session survives logout.
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(LEGACY_COOKIE, { path: "/" });
  return res.json({ message: "Logged out." });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  return res.json({ user: req.user });
});

// Google via BetterAuth. The old custom code flow and its callback
// /api/auth/google/callback are gone; BetterAuth handles
// /api/auth/callback/google (mounted below). If Google env vars are
// missing, return a clear 500 instead of crashing or redirecting.
app.get("/api/auth/google", async (req, res) => {
  if (!googleConfigured()) {
    return res.status(500).json({
      message: "Google login is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
  }
  if (!auth) return res.status(500).json({ message: "Authentication is not configured on the server." });
  try {
    const result = await auth.api.signInSocial({
      body: { provider: "google", callbackURL: CLIENT_URL },
      headers: headersFromReq(req, CLIENT_URL),
    });
    if (result && result.url) return res.redirect(result.url);
    return res.status(500).json({ message: "Google login failed. Please try again." });
  } catch (err) {
    console.error("google login error:", err);
    return res.status(500).json({ message: "Google login failed. Please try again." });
  }
});

// BetterAuth native endpoints: /api/auth/sign-in/*, /api/auth/sign-up/*,
// /api/auth/get-session, /api/auth/callback/google, /api/auth/sign-out,
// etc. Registered after the compat routes above, and reading `auth`
// lazily because it is only created in start() after connect().
app.all("/api/auth/*", (req, res) => {
  if (!auth) return res.status(500).json({ message: "Authentication is not configured on the server." });
  return toNodeHandler(auth)(req, res);
});

// ---------- Studios (public reads, protected mutations) ----------
app.get("/api/studios", async (req, res) => {
  try {
    const { category, search, limit } = req.query;
    let studios = await collection("studios").find({});
    if (category) studios = studios.filter((s) => s.category === category);
    if (search) {
      const q = String(search).toLowerCase();
      studios = studios.filter((s) =>
        [s.title, s.location, s.category].some((f) => String(f || "").toLowerCase().includes(q))
      );
    }
    studios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) studios = studios.slice(0, n);
    return res.json(studios);
  } catch (err) {
    console.error("list studios error:", err);
    return res.status(500).json({ message: "Could not load studios." });
  }
});

app.get("/api/my-listings", authRequired, async (req, res) => {
  try {
    const studios = await collection("studios").find({ ownerEmail: req.user.email });
    studios.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(studios);
  } catch (err) {
    return res.status(500).json({ message: "Could not load your listings." });
  }
});

app.get("/api/studios/:id", async (req, res) => {
  const studio = await collection("studios").findOne({ _id: req.params.id });
  if (!studio) return res.status(404).json({ message: "Studio not found." });
  return res.json(studio);
});

app.post("/api/studios", authRequired, async (req, res) => {
  try {
    const data = normalizeStudioInput(req.body || {});
    if (!data.title || !data.category || !data.location || !data.image || !data.overview)
      return res.status(400).json({ message: "Title, category, location, image and overview are required." });
    if (!CATEGORIES.includes(data.category))
      return res.status(400).json({ message: `Category must be one of: ${CATEGORIES.join(", ")}.` });
    if (!Number.isFinite(data.hourlyRate) || data.hourlyRate <= 0)
      return res.status(400).json({ message: "Hourly rate must be a number greater than 0." });
    const studio = {
      ...data,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
      ownerPhoto: req.user.photo || "",
      rating: 5.0,
      reviewsCount: 0,
      createdAt: new Date(),
    };
    const result = await collection("studios").insertOne(studio);
    studio._id = result.insertedId;
    return res.status(201).json(studio);
  } catch (err) {
    console.error("create studio error:", err);
    return res.status(500).json({ message: "Could not create studio." });
  }
});

app.put("/api/studios/:id", authRequired, async (req, res) => {
  try {
    const studios = collection("studios");
    const existing = await studios.findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ message: "Studio not found." });
    if (existing.ownerEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden: only the studio owner can update this listing." });
    const data = normalizeStudioInput({ ...existing, ...(req.body || {}) });
    if (data.category && !CATEGORIES.includes(data.category))
      return res.status(400).json({ message: `Category must be one of: ${CATEGORIES.join(", ")}.` });
    if (!Number.isFinite(data.hourlyRate) || data.hourlyRate <= 0)
      return res.status(400).json({ message: "Hourly rate must be a number greater than 0." });
    await studios.updateOne({ _id: req.params.id }, { $set: data });
    const updated = await studios.findOne({ _id: req.params.id });
    return res.json(updated);
  } catch (err) {
    console.error("update studio error:", err);
    return res.status(500).json({ message: "Could not update studio." });
  }
});

app.delete("/api/studios/:id", authRequired, async (req, res) => {
  try {
    const studios = collection("studios");
    const existing = await studios.findOne({ _id: req.params.id });
    if (!existing) return res.status(404).json({ message: "Studio not found." });
    if (existing.ownerEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden: only the studio owner can delete this listing." });
    await studios.deleteOne({ _id: req.params.id });
    return res.json({ message: "Studio deleted successfully." });
  } catch (err) {
    return res.status(500).json({ message: "Could not delete studio." });
  }
});

// ---------- Bookings ----------
app.post("/api/bookings", authRequired, async (req, res) => {
  try {
    const { studioId, date, startTime, endTime } = req.body || {};
    if (!studioId || !date || !startTime || !endTime)
      return res.status(400).json({ message: "Studio, date, start time and end time are required." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))
      return res.status(400).json({ message: "Date must be in YYYY-MM-DD format." });
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === null || end === null)
      return res.status(400).json({ message: "Start and end times must be in HH:MM format." });
    if (end <= start)
      return res.status(400).json({ message: "End time must be after start time." });

    const studio = await collection("studios").findOne({ _id: studioId });
    if (!studio) return res.status(404).json({ message: "Studio not found." });

    // Double-booking prevention: same studio + same date, overlapping time
    // against existing Pending or Confirmed bookings.
    const existing = await collection("bookings").find({ studioId: String(studioId), date: String(date) });
    const clash = existing.find(
      (b) =>
        ["Pending", "Confirmed"].includes(b.status) &&
        start < toMinutes(b.endTime) &&
        end > toMinutes(b.startTime)
    );
    if (clash) {
      return res.status(400).json({
        message: `This studio is already booked on ${date} from ${clash.startTime} to ${clash.endTime}. Please choose a different time slot.`,
      });
    }

    const hours = Math.round(((end - start) / 60) * 100) / 100;
    const totalPrice = Math.round(hours * Number(studio.hourlyRate) * 100) / 100;
    const booking = {
      studioId: String(studioId),
      studioTitle: studio.title,
      studioImage: studio.image,
      userEmail: req.user.email,
      userName: req.user.name,
      date: String(date),
      startTime: String(startTime),
      endTime: String(endTime),
      hours,
      totalPrice,
      status: "Pending",
      createdAt: new Date(),
    };
    const result = await collection("bookings").insertOne(booking);
    booking._id = result.insertedId;
    return res.status(201).json(booking);
  } catch (err) {
    console.error("create booking error:", err);
    return res.status(500).json({ message: "Could not create booking." });
  }
});

app.get("/api/bookings", authRequired, async (req, res) => {
  try {
    // Return the user's own bookings AND bookings on studios they own,
    // so a studio host can see and confirm incoming requests (which is
    // what makes a booking reach Confirmed and its PDF invoice).
    const all = await collection("bookings").find({});
    const studios = await collection("studios").find({});
    const studioById = new Map(studios.map((st) => [String(st._id), st]));
    const bookings = all
      .filter((b) => {
        const studio = studioById.get(String(b.studioId));
        return b.userEmail === req.user.email || studio?.ownerEmail === req.user.email;
      })
      .map((b) => {
        const studio = studioById.get(String(b.studioId));
        return {
          ...b,
          canCancel: b.userEmail === req.user.email,
          canConfirm: studio?.ownerEmail === req.user.email,
        };
      });
    bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(bookings);
  } catch (err) {
    return res.status(500).json({ message: "Could not load bookings." });
  }
});

app.patch("/api/bookings/:id/cancel", authRequired, async (req, res) => {
  try {
    const bookings = collection("bookings");
    const booking = await bookings.findOne({ _id: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    if (booking.userEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden: only the booking owner can cancel this booking." });
    if (booking.status !== "Pending")
      return res.status(400).json({ message: "Only pending bookings can be cancelled." });
    await bookings.updateOne({ _id: req.params.id }, { $set: { status: "Cancelled" } });
    return res.json(await bookings.findOne({ _id: req.params.id }));
  } catch (err) {
    return res.status(500).json({ message: "Could not cancel booking." });
  }
});

app.patch("/api/bookings/:id/confirm", authRequired, async (req, res) => {
  try {
    const bookings = collection("bookings");
    const booking = await bookings.findOne({ _id: req.params.id });
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const studio = await collection("studios").findOne({ _id: booking.studioId });
    if (!studio) return res.status(404).json({ message: "Studio for this booking was not found." });
    if (studio.ownerEmail !== req.user.email)
      return res.status(403).json({ message: "Forbidden: only the studio owner can confirm this booking." });
    if (booking.status !== "Pending")
      return res.status(400).json({ message: "Only pending bookings can be confirmed." });
    await bookings.updateOne({ _id: req.params.id }, { $set: { status: "Confirmed" } });
    return res.json(await bookings.findOne({ _id: req.params.id }));
  } catch (err) {
    return res.status(500).json({ message: "Could not confirm booking." });
  }
});

// ---------- Wishlist ----------
app.get("/api/wishlist", authRequired, async (req, res) => {
  try {
    const entries = await collection("wishlist").find({ userEmail: req.user.email });
    const studios = [];
    for (const entry of entries) {
      const studio = await collection("studios").findOne({ _id: entry.studioId });
      if (studio) studios.push(studio);
    }
    return res.json(studios);
  } catch (err) {
    return res.status(500).json({ message: "Could not load wishlist." });
  }
});

app.post("/api/wishlist", authRequired, async (req, res) => {
  try {
    const { studioId } = req.body || {};
    if (!studioId) return res.status(400).json({ message: "studioId is required." });
    const studio = await collection("studios").findOne({ _id: studioId });
    if (!studio) return res.status(404).json({ message: "Studio not found." });
    const wishlist = collection("wishlist");
    const existing = await wishlist.findOne({ userEmail: req.user.email, studioId: String(studioId) });
    if (existing) return res.json({ message: "Studio is already in your wishlist.", studio });
    await wishlist.insertOne({ userEmail: req.user.email, studioId: String(studioId), createdAt: new Date() });
    return res.status(201).json({ message: "Studio saved to wishlist.", studio });
  } catch (err) {
    return res.status(500).json({ message: "Could not save wishlist item." });
  }
});

app.delete("/api/wishlist/:studioId", authRequired, async (req, res) => {
  try {
    await collection("wishlist").deleteOne({
      userEmail: req.user.email,
      studioId: req.params.studioId,
    });
    return res.json({ message: "Studio removed from wishlist." });
  } catch (err) {
    return res.status(500).json({ message: "Could not remove wishlist item." });
  }
});

// ---------- Fallbacks ----------
app.use("/api", (req, res) => res.status(404).json({ message: "API route not found." }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Something went wrong on the server." });
});

// ---------- Startup: connect + auth + seed ----------
async function seed() {
  const studios = collection("studios");
  if ((await studios.countDocuments()) === 0) {
    const now = Date.now();
    for (let i = 0; i < SEED_STUDIOS.length; i++) {
      await studios.insertOne({ ...SEED_STUDIOS[i], createdAt: new Date(now - i * 3600 * 1000) });
    }
    console.log(`[seed] Inserted ${SEED_STUDIOS.length} studios.`);
  }
  // Examiner account, created THROUGH BetterAuth (never a hand-written
  // bcrypt hash — BetterAuth hashes passwords in its own scrypt format in
  // the account collection, so an old bcrypt hash would never verify).
  // signUpEmail is idempotent here: a duplicate email returns 422, which
  // just means the account already exists.
  try {
    const betterRes = await auth.api.signUpEmail({
      body: { name: "Examiner", email: "examiner@studiospace.test", password: "Examiner123" },
      headers: new Headers({ origin: CLIENT_URL }),
      asResponse: true,
    });
    if (betterRes.ok) {
      console.log("[seed] Inserted examiner demo user via BetterAuth.");
    } else {
      const body = await betterRes.json().catch(() => ({}));
      if (body.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
        console.log("[seed] Examiner demo user already exists.");
      } else {
        console.log("[seed] Examiner seed skipped:", body.message || betterRes.status);
      }
    }
  } catch (err) {
    console.log("[seed] Examiner seed skipped:", err.message);
  }
}

async function start() {
  await connect();
  auth = createAuth({ db: getDb(), clientUrl: CLIENT_URL, serverUrl: SERVER_URL });
  console.log(
    `Auth: BetterAuth (${isUsingMongo() ? "MongoDB adapter" : "in-memory adapter — set MONGODB_URI for persistent sessions"})`
  );
  if (!googleConfigured()) {
    console.log("Auth: Google login is not configured (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable it).");
  }
  await seed();
  app.listen(PORT, () => {
    console.log(`StudioSpace server running on http://localhost:${PORT}`);
    console.log(`Database: ${isUsingMongo() ? "MongoDB" : "in-memory (no MONGODB_URI or unreachable)"}`);
    console.log(`Client URL: ${CLIENT_URL}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = app;
