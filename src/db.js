// src/db.js
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB || 'sawalif';

let client;
let db;

async function connectDB() {
  if (db) return db;
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);
  console.log(`[MongoDB] متصل بقاعدة البيانات: ${dbName}`);
  return db;
}

function getDB() {
  if (!db) throw new Error('DB not initialized yet — call connectDB() first');
  return db;
}

module.exports = { connectDB, getDB };
