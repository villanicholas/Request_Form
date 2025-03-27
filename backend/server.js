require('dotenv').config();
console.log('Starting server...');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const https = require('https');

// Configuration
const PORT = process.env.PORT || 3000;
// Try multiple fallback API keys in case one isn't working
const COLLEGE_SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || 'vzKiSRkBHE30hxiBRlskSUCmGMqwSIXB3IlUGbq8';
console.log('Using College Scorecard API key with length:', COLLEGE_SCORECARD_API_KEY ? COLLEGE_SCORECARD_API_KEY.length : 0);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Initialize Express app
const app = express();

// Express middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'merchandise.db'), (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
  
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_name TEXT NOT NULL,
    building_name TEXT NOT NULL,
    email TEXT NOT NULL,
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
  db.get('SELECT COUNT(*) as count FROM admin_users', [], (err, row) => {
    if (err) {
      console.error('Error checking admin users:', err);
      return;
    }
    
    if (row.count === 0) {
      // Create default admin user
      db.run('INSERT INTO admin_users (username, password) VALUES (?, ?)', ['admin', 'admin123'], (err) => {
        if (err) {
          console.error('Error creating admin user:', err);
        } else {
          console.log('Default admin user created');
        }
      });
    } else {
      console.log('Admin user exists in database');
    }
  });
});

// Helper function to send JSON responses
function sendJsonResponse(res, data, statusCode = 200) {
  console.log(`Sending response with status ${statusCode}:`, typeof data === 'object' ? (Array.isArray(data) ? `Array with ${data.length} items` : JSON.stringify(data).substring(0, 100) + '...') : data);
  res.status(statusCode).json(data);
}

// Middleware to authenticate JWT tokens
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  console.log('Auth header:', authHeader ? 'Present' : 'Missing');
  
  if (!token) {
    return sendJsonResponse(res, { error: 'Authentication required' }, 401);
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification error:', err.message);
      return sendJsonResponse(res, { error: 'Invalid or expired token' }, 403);
    }
    
    console.log('Authenticated user:', user.username);
    req.user = user;
    next();
  });
}

// API Routes

// College Search API
app.get('/api/college-search', (req, res) => {
  const name = req.query.name;
  console.log('College search request for:', name);
  
  if (!name || name.length < 3) {
    sendJsonResponse(res, { error: 'Search term must be at least 3 characters' }, 400);
    return;
  }
  
  if (!COLLEGE_SCORECARD_API_KEY) {
    console.error('College Scorecard API key not set');
    sendJsonResponse(res, { error: 'API key not configured' }, 500);
    return;
  }
  
  const searchUrl = `https://api.data.gov/ed/collegescorecard/v1/schools.json?api_key=${COLLEGE_SCORECARD_API_KEY}&school.name=${encodeURIComponent(name)}&per_page=20&fields=id,school.name,school.city,school.state`;
  console.log('Making API request to College Scorecard API URL (hiding key):', 
              searchUrl.replace(COLLEGE_SCORECARD_API_KEY, 'API_KEY_HIDDEN'));
  
  https.get(searchUrl, (apiRes) => {
    let data = '';
    console.log('API response status code:', apiRes.statusCode);
    
    apiRes.on('data', (chunk) => {
      data += chunk;
    });
    
    apiRes.on('end', () => {
      try {
        // For debugging, log a snippet of the response
        console.log('API response preview (first 200 chars):', 
                   data.substring(0, 200) + (data.length > 200 ? '...' : ''));
        
        if (apiRes.statusCode !== 200) {
          console.error('College API returned non-200 status:', apiRes.statusCode);
          console.error('Response body:', data);
          sendJsonResponse(res, { error: `API returned status ${apiRes.statusCode}` }, 500);
          return;
        }
        
        const result = JSON.parse(data);
        
        if (result.error) {
          console.error('College API error:', result.error);
          sendJsonResponse(res, { error: 'Error fetching college data: ' + result.error }, 500);
          return;
        }
        
        if (!result.results || !Array.isArray(result.results)) {
          console.log('No results found or invalid format returned:', 
                     result.metadata ? JSON.stringify(result.metadata) : 'No metadata available');
          sendJsonResponse(res, [], 200);
          return;
        }
        
        const colleges = result.results.map(college => ({
          id: college.id,
          name: college["school.name"],
          city: college["school.city"],
          state: college["school.state"]
        }));
        
        console.log(`Found ${colleges.length} colleges matching "${name}"`);
        if (colleges.length > 0) {
          console.log('First college found:', JSON.stringify(colleges[0]));
        }
        
        sendJsonResponse(res, colleges);
      } catch (error) {
        console.error('Error parsing college data:', error);
        console.error('Raw data snippet that failed to parse:', data.substring(0, 500));
        sendJsonResponse(res, { error: 'Error processing college data: ' + error.message }, 500);
      }
    });
  }).on('error', (err) => {
    console.error('Error making college API request:', err);
    sendJsonResponse(res, { error: 'Failed to fetch college data: ' + err.message }, 500);
  });
});

// Submit request
app.post('/api/submit-request', (req, res) => {
  const body = req.body;
  
  console.log('Received request submission:', body);
  
  // Validate request
  if (!body.college_name || !body.building_name || !body.email) {
    sendJsonResponse(res, { error: 'College name, building name, and email are required' }, 400);
    return;
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email)) {
    sendJsonResponse(res, { error: 'Invalid email format' }, 400);
    return;
  }
  
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
      'INSERT INTO requests (college_name, building_name, email) VALUES (?, ?, ?)',
      [body.college_name, body.building_name, body.email],
      function(err) {
        if (err) {
          console.error('Error saving request:', err);
          sendJsonResponse(res, { error: 'Failed to save request' }, 500);
          return;
        }
        console.log('Request saved successfully with ID:', this.lastID);
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
  
  console.log('Admin login attempt for user:', username);
  
  // Validate input
  if (!username || !password) {
    sendJsonResponse(res, { error: 'Username and password are required' }, 400);
    return;
  }
  
  // Check admin credentials
  db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
    if (err) {
      console.error('Error querying admin user:', err);
      sendJsonResponse(res, { error: 'Login failed' }, 500);
      return;
    }
    
    if (!user) {
      console.log('Login failed: User not found');
      sendJsonResponse(res, { error: 'Invalid credentials' }, 401);
      return;
    }
    
    if (user.password !== password) {
      console.log('Login failed: Incorrect password');
      sendJsonResponse(res, { error: 'Invalid credentials' }, 401);
      return;
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful, generated token');
    
    sendJsonResponse(res, { token });
  });
});

// Verify token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  sendJsonResponse(res, { message: 'Token is valid', user: req.user });
});

// Get all requests for admin
app.get('/api/admin/requests', authenticateToken, (req, res) => {
  console.log('Fetching admin requests for user:', req.user.username);
  
  db.all('SELECT * FROM requests ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('Error fetching requests:', err);
      sendJsonResponse(res, { error: 'Failed to fetch requests' }, 500);
      return;
    }
    
    console.log(`Found ${rows ? rows.length : 0} requests`);
    sendJsonResponse(res, rows || []);
  });
});

// Update request status
app.put('/api/admin/requests/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  console.log(`Updating request ${id} status to ${status}`);
  
  if (!status || !['pending', 'approved', 'rejected', 'applied', 'accepted', 'declined'].includes(status)) {
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

// Update status for all requests from a college
app.put('/api/admin/college/:collegeName/status', authenticateToken, (req, res) => {
  const { collegeName } = req.params;
  const { status } = req.body;
  
  console.log(`Updating all requests for college "${collegeName}" to status ${status}`);
  
  if (!status || !['pending', 'approved', 'rejected', 'applied', 'accepted', 'declined'].includes(status)) {
    sendJsonResponse(res, { error: 'Invalid status value' }, 400);
    return;
  }
  
  db.run(
    'UPDATE requests SET status = ? WHERE college_name = ?',
    [status, collegeName],
    function(err) {
      if (err) {
        console.error('Error updating college requests status:', err);
        sendJsonResponse(res, { error: 'Failed to update requests status' }, 500);
        return;
      }
      
      if (this.changes === 0) {
        sendJsonResponse(res, { error: 'No requests found for this college' }, 404);
        return;
      }
      
      console.log(`Updated ${this.changes} requests for ${collegeName} to ${status}`);
      sendJsonResponse(res, { 
        message: `Status updated for all requests from ${collegeName}`,
        count: this.changes
      });
    }
  );
});

// Public endpoint to get school statistics for the homepage
app.get('/api/public/school-stats', (req, res) => {
  console.log('Fetching public school statistics');
  
  // Query to get college names, count of requests, and latest status
  const query = `
    SELECT 
      college_name,
      COUNT(*) as request_count,
      MAX(status) as latest_status
    FROM 
      requests
    GROUP BY 
      college_name
    ORDER BY 
      college_name ASC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching school statistics:', err);
      sendJsonResponse(res, { error: 'Failed to fetch school statistics' }, 500);
      return;
    }
    
    console.log(`Found statistics for ${rows ? rows.length : 0} schools`);
    sendJsonResponse(res, rows || []);
  });
});

// Admin endpoint to get detailed school statistics for analytics
app.get('/api/statistics/schools', authenticateToken, (req, res) => {
  console.log('Fetching detailed school statistics for admin analytics');
  
  // Query to get college names and count of requests with status counts
  const query = `
    SELECT 
      college_name,
      COUNT(*) as request_count,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
      SUM(CASE WHEN status = 'applied' THEN 1 ELSE 0 END) as applied_count,
      SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
      SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) as declined_count,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
    FROM 
      requests
    GROUP BY 
      college_name
    ORDER BY 
      request_count DESC
  `;
  
  db.all(query, [], (err, rows) => {
    if (err) {
      console.error('Error fetching detailed school statistics:', err);
      sendJsonResponse(res, { error: 'Failed to fetch school statistics' }, 500);
      return;
    }
    
    console.log(`Found detailed statistics for ${rows ? rows.length : 0} schools`);
    sendJsonResponse(res, rows || []);
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