require('dotenv').config();
console.log('Starting server...');
console.log('Loaded .env file');
console.log('API Key Present:', !!process.env.COLLEGE_SCORECARD_API_KEY);
console.log('API Key Length:', process.env.COLLEGE_SCORECARD_API_KEY?.length);

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const https = require('https');

// Configuration
const PORT = process.env.PORT || 3000;
const COLLEGE_SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || 'vzKiSRkBHE30hxiBRlskSUCmGMqwSIXB3IlUGbq8';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Initialize Express app
const app = express();

// Print deployment information
console.log('Starting server in environment:', process.env.NODE_ENV || 'development');
console.log('Current working directory:', process.cwd());
console.log('API Key configured:', COLLEGE_SCORECARD_API_KEY ? 'YES (length: ' + COLLEGE_SCORECARD_API_KEY.length + ')' : 'NO');

// Express middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Add uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Add unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Database setup
const dbPath = path.join(__dirname, 'merchandise.db');
console.log('Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database at:', dbPath);
  
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_name TEXT NOT NULL,
    email TEXT NOT NULL,
    building_name TEXT,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Create admin table if it doesn't exist  
  db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
  
  // Check if admin user exists, create if it doesn't
  db.get('SELECT COUNT(*) as count FROM admin_users WHERE username = ?', ['admin'], (err, row) => {
    if (err) {
      console.error('Error checking admin user:', err);
      return;
    }
    
    if (!row || row.count === 0) {
      console.log('Creating admin user...');
      db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', 'admin123'], (err) => {
        if (err) {
          console.error('Error creating admin user:', err);
        } else {
          console.log('Default admin user created');
        }
      });
    } else {
      console.log('Admin user already exists');
    }
  });
});

// Helper function to send JSON responses
function sendJsonResponse(res, data, statusCode = 200) {
  console.log('Sending JSON response:', { 
    statusCode, 
    dataType: typeof data,
    isArray: Array.isArray(data), 
    keys: typeof data === 'object' && data !== null ? Object.keys(data) : null 
  });
  res.status(statusCode).json(data);
}

// Middleware to authenticate JWT tokens
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    console.log('Authentication failed: No token provided');
    return sendJsonResponse(res, { error: 'Authentication required' }, 401);
  }
  
  console.log('Verifying token...');
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message);
      return sendJsonResponse(res, { error: 'Invalid or expired token' }, 403);
    }
    
    console.log('Token verified successfully for user:', user.username);
    req.user = user;
    next();
  });
}

// API Routes

// College Search API
app.get('/api/search-colleges', (req, res) => {
  const query = req.query.query;
  
  console.log(`Received college search request for: "${query}"`);
  
  if (!query || query.length < 2) {
    sendJsonResponse(res, { error: 'Search term must be at least 2 characters' }, 400);
    return;
  }
  
  const apiKey = COLLEGE_SCORECARD_API_KEY;
  if (!apiKey) {
    console.error('College Scorecard API key not set');
    sendJsonResponse(res, { error: 'API key not configured' }, 500);
    return;
  }
  
  const searchUrl = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${apiKey}&school.name=${encodeURIComponent(query)}&fields=school.name,school.city,school.state&per_page=10`;
  console.log('Making API request to:', searchUrl.replace(apiKey, 'API_KEY_HIDDEN'));
  
  https.get(searchUrl, (apiRes) => {
    let data = '';
    
    apiRes.on('data', (chunk) => {
      data += chunk;
    });
    
    apiRes.on('end', () => {
      try {
        console.log('College API response status:', apiRes.statusCode);
        
        if (apiRes.statusCode !== 200) {
          console.error('College API error:', data);
          sendJsonResponse(res, { error: 'Error fetching college data', details: data }, 500);
          return;
        }
        
        const result = JSON.parse(data);
        
        if (result.error) {
          console.error('College API error:', result.error);
          sendJsonResponse(res, { error: 'Error fetching college data', details: result.error }, 500);
          return;
        }
        
        // Ensure results array exists
        if (!result.results || !Array.isArray(result.results)) {
          console.error('College API returned invalid results format:', result);
          sendJsonResponse(res, [], 200); // Return empty array instead of error
          return;
        }
        
        const colleges = result.results.map(college => ({
          name: college.school?.name || 'Unknown College',
          city: college.school?.city || 'Unknown City',
          state: college.school?.state || 'Unknown State'
        }));
        
        console.log(`Found ${colleges.length} colleges for query: "${query}"`);
        sendJsonResponse(res, colleges);
      } catch (error) {
        console.error('Error parsing college data:', error);
        console.error('Raw response data:', data);
        sendJsonResponse(res, { error: 'Error processing college data' }, 500);
      }
    });
  }).on('error', (err) => {
    console.error('Error making college API request:', err);
    sendJsonResponse(res, { error: 'Failed to fetch college data', details: err.message }, 500);
  });
});

// Submit request
app.post('/api/submit-request', (req, res) => {
  const body = req.body;
  
  // Validate request
  if (!body.college_name || !body.email) {
    sendJsonResponse(res, { error: 'College name and email are required' }, 400);
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    sendJsonResponse(res, { error: 'Invalid email format' }, 400);
    return;
  }
  
  // Extract building_name (optional)
  const buildingName = body.building_name || null;
  
  // Check if email already exists
  db.get('SELECT id FROM requests WHERE email = ?', [body.email], (err, row) => {
    if (err) {
      console.error('Error checking email:', err);
      sendJsonResponse(res, { error: 'Failed to validate request' }, 500);
      return;
    }
    
    if (row) {
      sendJsonResponse(res, { 
        error: 'This email has already been used to submit a request' 
      }, 400);
      return;
    }
    
    // Email doesn't exist, proceed with insertion
    db.run(
      `INSERT INTO requests (college_name, email, building_name)
       VALUES (?, ?, ?)`,
      [body.college_name, body.email, buildingName],
      function(err) {
        if (err) {
          console.error('Error saving request:', err);
          sendJsonResponse(res, { error: 'Failed to save request' }, 500);
          return;
        }
        sendJsonResponse(res, {
          message: 'Request submitted successfully',
          request_id: this.lastID
        }, 201);
      }
    );
  });
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  
  console.log(`Login attempt for username: ${username}`);
  
  // Validate input
  if (!username || !password) {
    console.log('Login failed: missing username or password');
    sendJsonResponse(res, { error: 'Username and password are required' }, 400);
    return;
  }
  
  // Check admin credentials
  console.log('Checking admin credentials in database');
  db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('Error querying admin user:', err);
      sendJsonResponse(res, { error: 'Login failed', details: 'Database error' }, 500);
      return;
    }
    
    if (!user) {
      console.log(`Login failed: user "${username}" not found`);
      sendJsonResponse(res, { error: 'Invalid credentials' }, 401);
      return;
    }
    
    if (user.password !== password) {
      console.log(`Login failed: incorrect password for user "${username}"`);
      sendJsonResponse(res, { error: 'Invalid credentials' }, 401);
      return;
    }
    
    // Generate JWT token
    console.log(`Login successful for user "${username}"`);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    
    sendJsonResponse(res, { token });
  });
});

// Verify token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  sendJsonResponse(res, { message: 'Token is valid', user: req.user });
});

// Admin get requests
app.get('/api/admin/requests', authenticateToken, (req, res) => {
  console.log('Admin requests endpoint hit by user:', req.user?.username);
  
  // Get all requests from the database
  db.all('SELECT * FROM requests ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching requests:', err);
      sendJsonResponse(res, { error: 'Failed to fetch requests' }, 500);
      return;
    }
    
    console.log(`Found ${rows ? rows.length : 0} requests`);
    
    // Make sure we send an array
    const requests = rows || [];
    sendJsonResponse(res, requests);
  });
});

// Update request status
app.put('/api/admin/requests/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
    sendJsonResponse(res, { error: 'Invalid status value' }, 400);
    return;
  }
  
  db.run(
    'UPDATE requests SET status = ? WHERE id = ?',
    [status, id],
    function(err) {
      if (err) {
        console.error('Error updating request status:', err);
        sendJsonResponse(res, { error: 'Failed to update request status' }, 500);
        return;
      }
      
      if (this.changes === 0) {
        sendJsonResponse(res, { error: 'Request not found' }, 404);
        return;
      }
      
      sendJsonResponse(res, { message: 'Request status updated successfully' });
    }
  );
});

// Test endpoint to check if database is accessible
app.get('/api/test/requests', (req, res) => {
  console.log('Received test request for requests (no auth)');
  
  db.all(`SELECT id, college_name, email, building_name, status, created_at FROM requests ORDER BY created_at DESC`, (err, rows) => {
    if (err) {
      console.error('Error fetching requests in test endpoint:', err);
      sendJsonResponse(res, { error: 'Failed to fetch requests' }, 500);
      return;
    }
    
    console.log('Test endpoint found requests:', rows.length);
    // Always return an array, even if empty
    sendJsonResponse(res, rows || []);
  });
});

// Server status endpoint
app.get('/api/status', (req, res) => {
  db.get('SELECT COUNT(*) as adminCount FROM admin_users', [], (err, adminResult) => {
    let dbStatus = 'connected';
    let adminUsers = 0;
    
    if (err) {
      console.error('Error checking database status:', err);
      dbStatus = 'error';
    } else {
      adminUsers = adminResult ? adminResult.adminCount : 0;
    }
    
    db.get('SELECT COUNT(*) as requestCount FROM requests', [], (err, requestResult) => {
      let requestCount = 0;
      
      if (!err && requestResult) {
        requestCount = requestResult.requestCount;
      }
      
      const statusInfo = {
        status: 'running',
        environment: process.env.NODE_ENV || 'development',
        databaseStatus: dbStatus,
        adminUsers: adminUsers,
        requests: requestCount,
        apiKeyConfigured: !!COLLEGE_SCORECARD_API_KEY,
        serverTime: new Date().toISOString(),
        uptime: Math.floor(process.uptime()) + ' seconds'
      };
      
      sendJsonResponse(res, statusInfo);
    });
  });
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
}); 