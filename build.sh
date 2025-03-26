#!/usr/bin/env bash
# Build script for Render deployment

# Install dependencies
npm install

# Ensure the database file exists
touch backend/merchandise.db

# Create admin user if it doesn't exist
node -e "
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('backend/merchandise.db');

// Create tables if they don't exist
db.run(\`CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  college_name TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)\`);

db.run(\`CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
)\`);

// Check if admin user exists
db.get('SELECT COUNT(*) as count FROM admin_users WHERE username = ?', ['admin'], (err, row) => {
  if (err) {
    console.error('Error checking admin user:', err);
    process.exit(1);
  }
  
  // Create admin user if it doesn't exist
  if (row.count === 0) {
    db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', 'admin123'], function(err) {
      if (err) {
        console.error('Error creating admin user:', err);
        process.exit(1);
      }
      console.log('Admin user created successfully');
      db.close();
    });
  } else {
    console.log('Admin user already exists');
    db.close();
  }
});
"

# Make build.sh executable
chmod +x build.sh

echo "Build completed successfully" 