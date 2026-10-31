// Verification for the BetterAuth rewrite (dev/test only).
// Spins up mongodb-memory-server, starts the real server against it
// (MONGODB_URI = memory-server URI, no Atlas URI, no Google secrets),
// then exercises the compat + native auth endpoints and the protected
// studio/booking/wishlist routes. Exits non-zero if any check fails.
// Usage: npm run verify:better-auth
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const PORT = 5001;
const BASE = `http://localhost:${PORT}`;
const ORIGIN = "http://localhost:3000";
const results = [];
let jar = "";

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

function storeCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) jar = c.split(";")[0];
  return raw;
}

async function call(path, { method = "GET", body, cookie = true } = {}) {
  const headers = { "Content-Type": "application/json", Origin: ORIGIN };
  if (cookie && jar) headers.Cookie = jar;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  storeCookies(res);
  return { status: res.status, data, text, setCookie: res.headers.get("set-cookie") };
}

const mongod = await MongoMemoryServer.create();
const uri = mongod.getUri();
console.log(`[verify] memory MongoDB: ${uri}`);

const server = spawn("node", ["index.js"], {
  cwd: new URL("..", import.meta.url).pathname,
  env: {
    ...process.env,
    PORT: String(PORT),
    CLIENT_URL: ORIGIN,
    SERVER_URL: BASE,
    MONGODB_URI: uri,
    BETTER_AUTH_SECRET: "verify-secret-1234567890-verify-secret",
    NODE_ENV: "development",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (d) => process.stdout.write(`[server] ${d}`));
server.stderr.on("data", (d) => process.stderr.write(`[server:err] ${d}`));

let ready = false;
for (let i = 0; i < 60 && !ready; i++) {
  try {
    const r = await fetch(`${BASE}/api/health`);
    if (r.ok) ready = true;
  } catch {
    await new Promise((r) => setTimeout(r, 500));
  }
}
if (!ready) {
  console.log("FAIL  server did not become ready");
  server.kill();
  await mongod.stop();
  process.exit(1);
}

try {
  // 1. Examiner seeded via BetterAuth on startup
  let r = await call("/api/auth/login", { method: "POST", body: { email: "examiner@studiospace.test", password: "Examiner123" } });
  check("login examiner (seeded via BetterAuth)", r.status === 200 && r.data?.user?.email === "examiner@studiospace.test", `status=${r.status} user=${r.data?.user?.email} cookie=${r.setCookie ? "better-auth.session_token present" : "MISSING"}`);
  const examinerCookie = jar;

  // 2. /me shape + cookie auth
  r = await call("/api/auth/me");
  check("GET /api/auth/me with cookie", r.status === 200 && r.data?.user?.id && r.data?.user?.email === "examiner@studiospace.test" && "photo" in r.data.user, `status=${r.status} user=${JSON.stringify(r.data?.user)}`);
  const savedJar = jar; jar = "";
  r = await call("/api/auth/me", { cookie: false });
  check("GET /api/auth/me without cookie -> 401", r.status === 401, `status=${r.status} msg=${r.data?.message}`);
  jar = savedJar;

  // 3. Register: valid, weak variants, duplicate
  jar = "";
  r = await call("/api/auth/register", { method: "POST", body: { name: "Test User", email: "testuser@studiospace.test", password: "Test1234", photo: "" }, cookie: false });
  check("register valid", r.status === 201 && r.data?.user?.email === "testuser@studiospace.test", `status=${r.status} user=${r.data?.user?.email}`);
  for (const [label, pw] of [["too short", "abc"], ["no uppercase", "abcdef"], ["no lowercase", "ABCDEF"]]) {
    r = await call("/api/auth/register", { method: "POST", body: { name: "Weak", email: `weak-${label.replace(" ", "-")}@test.com`, password: pw }, cookie: false });
    check(`register weak (${label}) rejected`, r.status === 400, `status=${r.status} msg=${r.data?.message}`);
  }
  r = await call("/api/auth/register", { method: "POST", body: { name: "Dup", email: "examiner@studiospace.test", password: "Examiner123" }, cookie: false });
  check("register duplicate examiner rejected", r.status === 400, `status=${r.status} msg=${r.data?.message}`);

  // 4. Login: valid + wrong password
  jar = "";
  r = await call("/api/auth/login", { method: "POST", body: { email: "testuser@studiospace.test", password: "Test1234" }, cookie: false });
  check("login valid (new user)", r.status === 200 && r.data?.user?.email === "testuser@studiospace.test", `status=${r.status}`);
  r = await call("/api/auth/login", { method: "POST", body: { email: "testuser@studiospace.test", password: "Wrong123" }, cookie: false });
  check("login wrong password -> 401", r.status === 401, `status=${r.status} msg=${r.data?.message}`);

  // 5. Native BetterAuth endpoints
  jar = "";
  r = await call("/api/auth/sign-in/email", { method: "POST", body: { email: "examiner@studiospace.test", password: "Examiner123" }, cookie: false });
  check("native POST /api/auth/sign-in/email", r.status === 200, `status=${r.status} cookie=${r.setCookie ? "present" : "MISSING"}`);
  r = await call("/api/auth/get-session");
  check("native GET /api/auth/get-session", r.status === 200 && r.data?.user?.email === "examiner@studiospace.test", `status=${r.status}`);

  // 6. Unauthenticated mutations -> 401
  jar = "";
  r = await call("/api/studios", { method: "POST", body: { title: "X", category: "Photo Studio", hourlyRate: 10, location: "Dhaka", image: "https://example.com/x.jpg", overview: "x" }, cookie: false });
  check("unauth POST /api/studios -> 401", r.status === 401, `status=${r.status}`);
  r = await call("/api/bookings", { method: "POST", body: { studioId: "x", date: "2026-11-05", startTime: "10:00", endTime: "12:00" }, cookie: false });
  check("unauth POST /api/bookings -> 401", r.status === 401, `status=${r.status}`);

  // 7. Authenticated studio create (as examiner)
  jar = examinerCookie;
  r = await call("/api/auth/me");
  check("re-auth as examiner for mutations", r.status === 200, `status=${r.status}`);
  r = await call("/api/studios", { method: "POST", body: { title: "BetterAuth Test Studio", category: "Photo Studio", hourlyRate: 50, deposit: 100, capacity: 10, location: "Uttara, Dhaka", image: "https://images.unsplash.com/photo-1554048612-b6a482bc67e5?auto=format&fit=crop&w=1200&q=80", amenities: ["Wi-Fi"], overview: "Created by the BetterAuth verification script." } });
  check("auth POST /api/studios -> 201", r.status === 201 && r.data?.ownerEmail === "examiner@studiospace.test", `status=${r.status} owner=${r.data?.ownerEmail}`);
  const createdId = r.data?._id;

  // 8. Booking on a seed studio + overlap rejection
  r = await call("/api/studios?limit=1");
  const seedStudio = Array.isArray(r.data) ? r.data[0] : null;
  check("seed studios present", !!seedStudio, `first=${seedStudio?.title} rate=${seedStudio?.hourlyRate}`);
  r = await call("/api/bookings", { method: "POST", body: { studioId: seedStudio._id, date: "2026-11-05", startTime: "10:00", endTime: "12:00" } });
  check("booking create -> 201 Pending", r.status === 201 && r.data?.status === "Pending", `status=${r.status} total=${r.data?.totalPrice} hours=${r.data?.hours}`);
  r = await call("/api/bookings", { method: "POST", body: { studioId: seedStudio._id, date: "2026-11-05", startTime: "11:00", endTime: "13:00" } });
  check("booking overlap -> 400", r.status === 400 && /already booked/.test(r.data?.message || ""), `status=${r.status} msg=${r.data?.message}`);

  // 9. Wishlist add + list
  r = await call("/api/wishlist", { method: "POST", body: { studioId: seedStudio._id } });
  check("wishlist add", r.status === 201 || r.status === 200, `status=${r.status}`);
  r = await call("/api/wishlist");
  check("wishlist list contains studio", r.status === 200 && Array.isArray(r.data) && r.data.some((s) => s._id === seedStudio._id), `status=${r.status} count=${Array.isArray(r.data) ? r.data.length : "?"}`);

  // 10. Google unconfigured -> clear 500 (no Google secrets in this test)
  r = await call("/api/auth/google");
  check("GET /api/auth/google without Google env -> 500 JSON", r.status === 500 && /not configured/.test(r.data?.message || ""), `status=${r.status} msg=${r.data?.message}`);

  // 11. Logout then /me -> 401 (session revoked server-side)
  r = await call("/api/auth/logout", { method: "POST" });
  check("POST /api/auth/logout", r.status === 200, `status=${r.status}`);
  r = await call("/api/auth/me");
  check("GET /api/auth/me after logout -> 401", r.status === 401, `status=${r.status}`);

  // 12. Cleanup: delete the studio created above (re-login first)
  jar = "";
  await call("/api/auth/login", { method: "POST", body: { email: "examiner@studiospace.test", password: "Examiner123" }, cookie: false });
  if (createdId) {
    r = await call(`/api/studios/${createdId}`, { method: "DELETE" });
    check("auth DELETE /api/studios/:id cleanup", r.status === 200, `status=${r.status}`);
  }
} finally {
  server.kill();
  await mongod.stop();
}

const failed = results.filter((x) => !x.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log("Failures:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
