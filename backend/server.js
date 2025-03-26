require('dotenv').config();
console.log('Starting server...');
console.log('Loaded .env file');
console.log('API Key Present:', !!process.env.COLLEGE_SCORECARD_API_KEY);
console.log('API Key Length:', process.env.COLLEGE_SCORECARD_API_KEY?.length);

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const https = require('https');  // Add HTTPS module for secure requests

const app = http.createServer();
const port = process.env.PORT || 3000;

// Add uncaught exception handler
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// Add unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Database setup
const db = new sqlite3.Database('merchandise.db', (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to SQLite database');
  
  // Create tables if they don't exist
  db.run(`CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    college_name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )`);
});

// Helper function to parse JSON body
const parseBody = (req) => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
  });
};

// Helper function to send JSON response
const sendJsonResponse = (res, data, statusCode = 200) => {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// Helper function to validate email
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Middleware to verify JWT token
const authenticateToken = (req, res, callback) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    sendJsonResponse(res, { error: 'Access token required' }, 401);
    return;
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const user = JSON.parse(decoded);
    callback(user);
  } catch (err) {
    sendJsonResponse(res, { error: 'Invalid token' }, 403);
  }
};

// Helper function to serve static files
const serveStaticFile = (res, filePath, contentType) => {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        fs.readFile(path.join(__dirname, '../frontend/404.html'), (err, content) => {
          res.writeHead(404, { 'Content-Type': 'text/html' });
          res.end(content || 'File not found');
        });
      } else {
        // Server error
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      // Success
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
};

// Routes
app.on('request', async (req, res) => {
  console.log(`Received ${req.method} request to ${req.url}`);
  
  // Set CORS headers for all requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '3600');

  // Handle OPTIONS request for CORS
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  try {
    // Handle API requests
    if (pathname.startsWith('/api/')) {
      // Search colleges
      if (req.method === 'GET' && pathname === '/api/search-colleges') {
        console.log('====== COLLEGE SEARCH API REQUEST RECEIVED ======');
        console.log('Request URL:', req.url);
        console.log('Request query params:', parsedUrl.query);
        
        const { query } = parsedUrl.query;
        if (!query) {
          console.error('Search query is missing');
          sendJsonResponse(res, { error: 'Search query is required' }, 400);
          return;
        }

        console.log('API Key present:', !!process.env.COLLEGE_SCORECARD_API_KEY);
        console.log('API Key length:', process.env.COLLEGE_SCORECARD_API_KEY?.length);
        console.log('Current working directory:', process.cwd());
        console.log('API Key value:', process.env.COLLEGE_SCORECARD_API_KEY);

        if (!process.env.COLLEGE_SCORECARD_API_KEY) {
          console.error('College Scorecard API key is not set');
          sendJsonResponse(res, { error: 'API configuration error' }, 500);
          return;
        }

        // Using the College Scorecard API
        const apiUrl = `https://api.data.gov/ed/collegescorecard/v1/schools?api_key=${process.env.COLLEGE_SCORECARD_API_KEY}&school.name=${encodeURIComponent(query)}&fields=school.name,school.city,school.state&per_page=10`;
        
        console.log('Searching colleges with query:', query);
        console.log('API URL:', apiUrl);
        
        try {
          const response = await new Promise((resolve, reject) => {
            https.get(apiUrl, (res) => {
              console.log('API Response status:', res.statusCode);
              console.log('API Response headers:', res.headers);
              
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                try {
                  console.log('Raw API response:', data);
                  const parsedData = JSON.parse(data);
                  if (parsedData.error) {
                    console.error('API Error:', parsedData.error);
                    reject(new Error(parsedData.error));
                  } else {
                    resolve(parsedData);
                  }
                } catch (err) {
                  console.error('Error parsing API response:', err);
                  reject(err);
                }
              });
            }).on('error', (err) => {
              console.error('Error making API request:', err);
              reject(err);
            });
          });

          if (!response.results || !Array.isArray(response.results)) {
            console.error('Invalid API response format:', response);
            sendJsonResponse(res, { error: 'Invalid API response' }, 500);
            return;
          }

          const colleges = response.results.map(school => ({
            name: school['school.name'],
            city: school['school.city'],
            state: school['school.state']
          }));

          console.log('Found colleges:', colleges);
          console.log('====== COLLEGE SEARCH API REQUEST COMPLETED ======');
          sendJsonResponse(res, colleges);
        } catch (err) {
          console.error('Error during college search:', err);
          sendJsonResponse(res, { error: 'Failed to search colleges: ' + err.message }, 500);
        }
        return;
      }

      // Submit request
      if (req.method === 'POST' && pathname === '/api/submit-request') {
        const body = await parseBody(req);
        
        if (!body.college_name || !body.email || !isValidEmail(body.email)) {
          sendJsonResponse(res, { error: 'Invalid input' }, 400);
          return;
        }

        // Check if email has already been used
        db.get('SELECT id FROM requests WHERE email = ?', [body.email], (err, row) => {
          if (err) {
            console.error('Error checking email:', err);
            sendJsonResponse(res, { error: 'Failed to process request' }, 500);
            return;
          }
          
          if (row) {
            // Email already exists
            sendJsonResponse(res, { 
              error: 'This email has already been used to submit a request. Each email can only be used once.'
            }, 400);
            return;
          }
          
          // Email doesn't exist, proceed with insertion
          db.run(
            `INSERT INTO requests (college_name, email)
             VALUES (?, ?)`,
            [body.college_name, body.email],
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
        return;
      }

      // Admin login
      if (req.method === 'POST' && pathname === '/api/admin/login') {
        const body = await parseBody(req);
        const { username, password } = body;

        db.get(
          'SELECT * FROM admin_users WHERE username = ?',
          [username],
          (err, user) => {
            if (err) {
              console.error('Error during login:', err);
              sendJsonResponse(res, { error: 'Login failed' }, 500);
              return;
            }

            if (!user || user.password !== password) {
              sendJsonResponse(res, { error: 'Invalid credentials' }, 401);
              return;
            }
            
            const token = Buffer.from(JSON.stringify({
              id: user.id,
              username: user.username
            })).toString('base64');

            sendJsonResponse(res, { token });
          }
        );
        return;
      }

      // Get all requests (admin only)
      if (req.method === 'GET' && pathname === '/api/requests') {
        authenticateToken(req, res, () => {
          db.all('SELECT * FROM requests ORDER BY created_at DESC', [], (err, rows) => {
            if (err) {
              console.error('Error fetching requests:', err);
              sendJsonResponse(res, { error: 'Failed to fetch requests' }, 500);
              return;
            }
            sendJsonResponse(res, rows);
          });
        });
        return;
      }

      // Get school statistics (admin only)
      if (req.method === 'GET' && pathname === '/api/statistics/schools') {
        authenticateToken(req, res, () => {
          db.all(
            `SELECT college_name, COUNT(*) as request_count, 
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
            COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied_count,
            COUNT(CASE WHEN status = 'declined' THEN 1 END) as declined_count,
            COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count
            FROM requests 
            GROUP BY college_name 
            ORDER BY request_count DESC`, 
            [], 
            (err, rows) => {
              if (err) {
                console.error('Error fetching school statistics:', err);
                sendJsonResponse(res, { error: 'Failed to fetch statistics' }, 500);
                return;
              }
              sendJsonResponse(res, rows);
            }
          );
        });
        return;
      }

      // Get public school statistics (no auth required)
      if (req.method === 'GET' && pathname === '/api/public/school-stats') {
        db.all(
          `SELECT r.college_name, COUNT(*) as request_count, 
           (SELECT status FROM requests WHERE college_name = r.college_name ORDER BY created_at DESC LIMIT 1) as latest_status
           FROM requests r
           GROUP BY r.college_name 
           ORDER BY request_count DESC`, 
          [], 
          (err, rows) => {
            if (err) {
              console.error('Error fetching public school statistics:', err);
              sendJsonResponse(res, { error: 'Failed to fetch statistics' }, 500);
              return;
            }
            sendJsonResponse(res, rows);
          }
        );
        return;
      }

      // Update request status (admin only)
      if (req.method === 'PATCH' && pathname.startsWith('/api/requests/')) {
        const id = pathname.split('/').pop();
        authenticateToken(req, res, async () => {
          const body = await parseBody(req);
          const { status } = body;

          if (!['pending', 'approved', 'rejected', 'applied', 'declined', 'accepted'].includes(status)) {
            sendJsonResponse(res, { error: 'Invalid status' }, 400);
            return;
          }

          db.run(
            'UPDATE requests SET status = ? WHERE id = ?',
            [status, id],
            function(err) {
              if (err) {
                console.error('Error updating request:', err);
                sendJsonResponse(res, { error: 'Failed to update request' }, 500);
                return;
              }
              if (this.changes === 0) {
                sendJsonResponse(res, { error: 'Request not found' }, 404);
                return;
              }
              sendJsonResponse(res, { message: 'Request updated successfully' });
            }
          );
        });
        return;
      }

      // Handle 404
      sendJsonResponse(res, { error: 'Not found' }, 404);
    } 
    // Serve static files
    else {
      let filePath;
      let contentType;
      
      // Map URLs to frontend files
      if (pathname === '/' || pathname === '') {
        filePath = path.join(__dirname, '../frontend/index.html');
        contentType = 'text/html';
      } else {
        filePath = path.join(__dirname, '../frontend', pathname);
        
        // Set content type based on file extension
        const extname = path.extname(filePath);
        switch (extname) {
          case '.html':
            contentType = 'text/html';
            break;
          case '.js':
            contentType = 'text/javascript';
            break;
          case '.css':
            contentType = 'text/css';
            break;
          case '.json':
            contentType = 'application/json';
            break;
          case '.png':
            contentType = 'image/png';
            break;
          case '.jpg':
            contentType = 'image/jpg';
            break;
          case '.svg':
            contentType = 'image/svg+xml';
            break;
          default:
            contentType = 'text/plain';
        }
      }
      
      serveStaticFile(res, filePath, contentType);
      return;
    }
  } catch (err) {
    console.error('Error:', err);
    sendJsonResponse(res, { error: 'Internal server error' }, 500);
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Access the application at http://localhost:${port}`);
}); 