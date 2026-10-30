require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { connect, collection, isUsingMongo } = require("./db");
const { SEED_STUDIOS, seedDemoUser } = require("./seed");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || "studiospace-dev-secret-change-me";
const CLIENT_URL = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");
const COOKIE_NAME = "studiospace_token";
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

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function cookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: isProduction() ? "none" : "lax",
    secure: isProduction(),
  };
}

function setAuthCookie(res, user) {
  const token = jwt.sign(
    { id: user._id, name: user.name, email: user.email, photo: user.photo || "" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

function publicUser(user) {
  if (!user) return null;
  return { id: user._id, name: user.name, email: user.email, photo: user.photo || "" };
}

function authRequired(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) return res.status(401).json({ message: "Unauthorized: please log in first." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (err) {
    return res.status(401).json({ message: "Unauthorized: session is invalid or expired." });
  }
}

function validatePassword(password) {
  if (!password || password.length < 6)
    return "Password must be at least 6 characters long.";
  if (!/[A-Z]/.test(password)) return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password)) return "Password must contain at least one lowercase letter.";
  return null;
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

// ---------- Auth ----------
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, photo, password } = req.body || {};
    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required." });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const users = collection("users");
    const normalizedEmail = String(email).trim().toLowerCase();
    const existing = await users.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: "An account with this email already exists." });

    const hashed = await bcrypt.hash(password, 10);
    const user = {
      name: String(name).trim(),
      email: normalizedEmail,
      photo: String(photo || "").trim(),
      password: hashed,
      provider: "email",
      createdAt: new Date(),
    };
    const result = await users.insertOne(user);
    user._id = result.insertedId;
    setAuthCookie(res, user);
    return res.status(201).json({ message: "Registration successful.", user: publicUser(user) });
  } catch (err) {
    console.error("register error:", err);
    return res.status(500).json({ message: "Registration failed. Please try again." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required." });
    const users = collection("users");
    const user = await users.findOne({ email: String(email).trim().toLowerCase() });
    if (!user) return res.status(401).json({ message: "Invalid email or password." });
    const ok = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!ok) return res.status(401).json({ message: "Invalid email or password." });
    setAuthCookie(res, user);
    return res.json({ message: "Login successful.", user: publicUser(user) });
  } catch (err) {
    console.error("login error:", err);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: 0 });
  return res.json({ message: "Logged out." });
});

app.get("/api/auth/me", authRequired, async (req, res) => {
  try {
    const user = await collection("users").findOne({ email: req.user.email });
    if (!user) return res.status(401).json({ message: "Unauthorized: user not found." });
    return res.json({ user: publicUser(user) });
  } catch (err) {
    return res.status(500).json({ message: "Could not load user." });
  }
});

// ---------- Google OAuth2 (code flow) ----------
app.get("/api/auth/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      message: "Google login is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
  }
  const serverUrl = (process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
  const redirectUri = `${serverUrl}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "consent",
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/api/auth/google/callback", async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(500).json({
      message: "Google login is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    });
  }
  const { code, error } = req.query;
  if (error) return res.redirect(`${CLIENT_URL}/login?error=${encodeURIComponent(String(error))}`);
  if (!code) return res.status(400).json({ message: "Google login failed: missing authorization code." });
  try {
    const serverUrl = (process.env.SERVER_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const redirectUri = `${serverUrl}/api/auth/google/callback`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("google token error:", tokenData);
      return res.redirect(`${CLIENT_URL}/login?error=google_token_failed`);
    }
    const profileRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();
    if (!profileRes.ok || !profile.email) {
      return res.redirect(`${CLIENT_URL}/login?error=google_profile_failed`);
    }
    const users = collection("users");
    const email = String(profile.email).toLowerCase();
    let user = await users.findOne({ email });
    if (!user) {
      const created = {
        name: profile.name || email.split("@")[0],
        email,
        photo: profile.picture || "",
        password: await bcrypt.hash(`google-${Date.now()}-${Math.random()}`, 10),
        provider: "google",
        createdAt: new Date(),
      };
      const result = await users.insertOne(created);
      created._id = result.insertedId;
      user = created;
    }
    setAuthCookie(res, user);
    return res.redirect(CLIENT_URL);
  } catch (err) {
    console.error("google callback error:", err);
    return res.redirect(`${CLIENT_URL}/login?error=google_login_failed`);
  }
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
    const bookings = await collection("bookings").find({ userEmail: req.user.email });
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

// ---------- Startup: connect + seed ----------
async function seed() {
  const studios = collection("studios");
  if ((await studios.countDocuments()) === 0) {
    const now = Date.now();
    for (let i = 0; i < SEED_STUDIOS.length; i++) {
      await studios.insertOne({ ...SEED_STUDIOS[i], createdAt: new Date(now - i * 3600 * 1000) });
    }
    console.log(`[seed] Inserted ${SEED_STUDIOS.length} studios.`);
  }
  const users = collection("users");
  if (!(await users.findOne({ email: "examiner@studiospace.test" }))) {
    await users.insertOne(await seedDemoUser());
    console.log("[seed] Inserted examiner demo user.");
  }
}

async function start() {
  await connect();
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
