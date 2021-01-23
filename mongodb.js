import dotenv from 'dotenv';
import mongodb from "mongodb";

const { MongoClient } = mongodb;
dotenv.config();

const client = new MongoClient(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
let connected = false;

export async function initDatabase() {
  if (!connected) {
    await client.connect();
    connected = true;
  }
  return client.db("db");
}

export function serializeDocument(doc, options = {}) {
  return JSON.parse(JSON.stringify(doc));
}
