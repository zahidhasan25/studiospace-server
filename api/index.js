// Vercel serverless wrapper for the MAIN (JWT) StudioSpace server only.
// The root index.js exports the Express app but only runs connect+seed
// when started directly (node index.js), so on Vercel we run that init
// once per cold start here, then delegate every request to the app.
// Do NOT use this with the BetterAuth branch — its init is different.
const app = require("../index.js");
const { connect, collection } = require("../db.js");
const { SEED_STUDIOS, seedDemoUser } = require("../seed.js");

let initPromise = null;
async function ensureInit() {
  if (!initPromise) {
    initPromise = (async () => {
      await connect();
      const studios = collection("studios");
      if ((await studios.countDocuments()) === 0) {
        const now = Date.now();
        for (let i = 0; i < SEED_STUDIOS.length; i++) {
          await studios.insertOne({ ...SEED_STUDIOS[i], createdAt: new Date(now - i * 3600 * 1000) });
        }
      }
      const users = collection("users");
      if (!(await users.findOne({ email: "examiner@studiospace.test" }))) {
        await users.insertOne(await seedDemoUser());
      }
    })().catch((err) => {
      // Let the next request retry init instead of caching a failure.
      initPromise = null;
      console.error("[vercel] init failed:", err.message);
      throw err;
    });
  }
  return initPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureInit();
  } catch (err) {
    return res.status(500).json({ message: "Server init failed. Please retry." });
  }
  return app(req, res);
};
