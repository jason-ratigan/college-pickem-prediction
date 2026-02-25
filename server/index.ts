// server/index.ts

// NOTE: dotenv.config() is no longer needed here because we use the
// --env-file flag in our `npm run dev:server` script.

import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import apiRoutes from './routes.js';
import cors from 'cors';
import { pool } from './db.js';

const app = express();
// Ensure the port from .env is used, defaulting to 3001 if not set.
const port = process.env.PORT || 3001;

// =============================================================================
// MIDDLEWARE
// =============================================================================

// 1. CORS (Cross-Origin Resource Sharing)
// Allows our frontend (running on http://localhost:5173) to make requests
// to our backend (running on http://localhost:3001).
app.use(cors({
  origin: 'http://localhost:5173', // The URL of our Vite frontend dev server
  credentials: true // Important for sessions and cookies
}));

// 2. JSON & URL-Encoded Body Parsers
// Allows Express to understand JSON and form data sent in request bodies.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Express Session with PostgreSQL Store
// Creates and manages user sessions with persistent database storage.
const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    pool: pool as any,             // Use existing database connection pool
    tableName: 'session',          // Table name for session storage
    createTableIfMissing: false,   // We handle this via migration
    pruneSessionInterval: 60 * 15  // Cleanup expired sessions every 15 minutes
  }),
  
  // This secret is used to sign the session ID cookie.
  secret: process.env.SESSION_SECRET || 'a-very-secret-key-for-local-dev-change-it-later',
  
  // These are standard settings for most session stores.
  resave: false,
  saveUninitialized: false,

  // Configuration for the session cookie.
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Only send cookie over HTTPS in production
    httpOnly: true, // Prevents client-side JavaScript from accessing the cookie
    maxAge: 1000 * 60 * 60 * 24 * 30 // Cookie will expire in 30 days
  }
}));

// =============================================================================
// ROUTES
// =============================================================================

// Simple logging middleware for debugging API calls.
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Mount all of our API endpoints under the /api/v1 prefix.
app.use('/api/v1', apiRoutes);

// API 404 handler for clearer errors
app.use('/api/v1', (req, res) => {
  res.status(404).json({ message: 'API route not found', method: req.method, path: req.originalUrl });
});

// =============================================================================
// START SERVER
// =============================================================================
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve static files from the React app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../dist/client')));

  // For any other requests, serve the index.html from the React app
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../dist/client/index.html'));
  });
}

app.listen(port, () => {
  console.log(`✅ Server is running successfully on http://localhost:${port}`);
});