/**
 * MongoDB connection helper — Serverless-safe with connection caching.
 *
 * On Vercel, each serverless function invocation may reuse a warm container.
 * We cache the mongoose connection so that reused containers don't open a
 * new connection on every request (which would exhaust the Atlas connection pool).
 */

'use strict';

const mongoose = require('mongoose');

// Cache the connection promise so warm Lambda/Vercel reuses it
let cached = global._mongooseConnection;

if (!cached) {
  cached = global._mongooseConnection = { conn: null, promise: null };
}

/**
 * Connect to MongoDB with Mongoose.
 * Reads MONGO_URI from environment variables.
 * Safe to call on every request — returns cached connection if already open.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    // Throw instead of process.exit — serverless functions must not call exit()
    throw new Error('MONGO_URI environment variable is not defined. Set it in Vercel Environment Variables.');
  }

  // Return cached connection if already established
  if (cached.conn) {
    return cached.conn;
  }

  // Create the connection promise if not already pending
  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 10000, // 10s timeout for Atlas cold starts
      socketTimeoutMS: 45000,
      maxPoolSize: 10,               // limit connections for serverless
      bufferCommands: false,         // fail fast if not connected
    };

    cached.promise = mongoose.connect(uri, opts).then((mongooseInstance) => {
      console.log(`✅  MongoDB connected: ${mongooseInstance.connection.host}`);
      console.log(`    Database: ${mongooseInstance.connection.name}`);
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (err) {
    // Reset so future calls retry rather than hanging on a failed promise
    cached.promise = null;
    console.error(`❌  MongoDB connection error: ${err.message}`);
    throw err; // Let the route handler return a 500 gracefully
  }

  return cached.conn;
}

module.exports = connectDB;

