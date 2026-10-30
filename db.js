// Minimal data layer: MongoDB when MONGODB_URI works, otherwise an
// in-memory store with the same query surface used by index.js.
// This keeps the server running (and seeded) even without a database,
// instead of crashing on startup.
const { MongoClient, ObjectId } = require("mongodb");

let client = null;
let db = null;
let useMongo = false;

const memory = {
  users: [],
  studios: [],
  bookings: [],
  wishlist: [],
};

function newId() {
  return new ObjectId().toHexString();
}

function normalizeId(doc) {
  if (!doc) return doc;
  const out = { ...doc };
  if (out._id && typeof out._id !== "string") out._id = String(out._id);
  return out;
}

// Very small matcher: equality, $in, and $regex (used only by this app).
function matches(doc, filter = {}) {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if (cond.$in) return cond.$in.some((v) => String(v) === String(value));
      if (cond.$regex) {
        const re = cond.$regex instanceof RegExp ? cond.$regex : new RegExp(cond.$regex, cond.$options || "i");
        return re.test(String(value ?? ""));
      }
      return false;
    }
    return String(value ?? "") === String(cond ?? "");
  });
}

function memoryCollection(name) {
  const arr = memory[name];
  return {
    async find(filter = {}) {
      return arr.filter((d) => matches(d, filter)).map(normalizeId);
    },
    async findOne(filter = {}) {
      const found = arr.find((d) => matches(d, filter));
      return found ? normalizeId(found) : null;
    },
    async insertOne(doc) {
      const withId = { _id: doc._id || newId(), ...doc };
      arr.push(withId);
      return { insertedId: withId._id };
    },
    async updateOne(filter, update) {
      const found = arr.find((d) => matches(d, filter));
      if (!found) return { modifiedCount: 0 };
      if (update.$set) Object.assign(found, update.$set);
      return { modifiedCount: 1 };
    },
    async deleteOne(filter) {
      const idx = arr.findIndex((d) => matches(d, filter));
      if (idx === -1) return { deletedCount: 0 };
      arr.splice(idx, 1);
      return { deletedCount: 1 };
    },
    async countDocuments(filter = {}) {
      return arr.filter((d) => matches(d, filter)).length;
    },
  };
}

function mongoCollection(name) {
  const col = db.collection(name);
  return {
    async find(filter = {}) {
      const docs = await col.find(filter).toArray();
      return docs.map(normalizeId);
    },
    async findOne(filter = {}) {
      const mongoFilter = { ...filter };
      if (mongoFilter._id && typeof mongoFilter._id === "string" && ObjectId.isValid(mongoFilter._id)) {
        mongoFilter._id = new ObjectId(mongoFilter._id);
      }
      return normalizeId(await col.findOne(mongoFilter));
    },
    async insertOne(doc) {
      const res = await col.insertOne(doc);
      return { insertedId: String(res.insertedId) };
    },
    async updateOne(filter, update) {
      const mongoFilter = { ...filter };
      if (mongoFilter._id && typeof mongoFilter._id === "string" && ObjectId.isValid(mongoFilter._id)) {
        mongoFilter._id = new ObjectId(mongoFilter._id);
      }
      const res = await col.updateOne(mongoFilter, update);
      return { modifiedCount: res.modifiedCount };
    },
    async deleteOne(filter) {
      const mongoFilter = { ...filter };
      if (mongoFilter._id && typeof mongoFilter._id === "string" && ObjectId.isValid(mongoFilter._id)) {
        mongoFilter._id = new ObjectId(mongoFilter._id);
      }
      const res = await col.deleteOne(mongoFilter);
      return { deletedCount: res.deletedCount };
    },
    async countDocuments(filter = {}) {
      return col.countDocuments(filter);
    },
  };
}

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("[db] No MONGODB_URI set — using in-memory store.");
    return false;
  }
  try {
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    await client.db().admin().ping();
    db = client.db();
    useMongo = true;
    console.log("[db] Connected to MongoDB.");
    return true;
  } catch (err) {
    console.log("[db] MongoDB unreachable, falling back to in-memory store:", err.message);
    client = null;
    db = null;
    useMongo = false;
    return false;
  }
}

function collection(name) {
  return useMongo ? mongoCollection(name) : memoryCollection(name);
}

function isUsingMongo() {
  return useMongo;
}

module.exports = { connect, collection, isUsingMongo, newId };
