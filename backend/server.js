require('dotenv').config();
console.log('Starting server...');

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const https = require('https');
const { Request, AdminUser } = require('./db');

// Configuration
const PORT = process.env.PORT || 3000;
const COLLEGE_SCORECARD_API_KEY = process.env.COLLEGE_SCORECARD_API_KEY || 'vzKiSRkBHE30hxiBRlskSUCmGMqwSIXB3IlUGbq8';
const ABSTRACT_EMAIL_API_KEY = process.env.ABSTRACT_EMAIL_API_KEY;
console.log('Using College Scorecard API key with length:', COLLEGE_SCORECARD_API_KEY ? COLLEGE_SCORECARD_API_KEY.length : 0);
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';

// Initialize Express app
const app = express();

// Express middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

// Helper function to send JSON responses
function sendJsonResponse(res, data, statusCode = 200) {
  console.log(`Sending response with status ${statusCode}:`, typeof data === 'object' ? (Array.isArray(data) ? `Array with ${data.length} items` : JSON.stringify(data).substring(0, 100) + '...') : data);
  res.status(statusCode).json(data);
}

// Helper function to verify email using Abstract API
async function verifyEmail(email) {
  return new Promise((resolve, reject) => {
    if (!ABSTRACT_EMAIL_API_KEY) {
      console.warn('Abstract API key not set, skipping email verification');
      resolve(true); // Skip verification if API key not set
      return;
    }

    const options = {
      hostname: 'emailvalidation.abstractapi.com',
      path: `/v1/?api_key=${ABSTRACT_EMAIL_API_KEY}&email=${encodeURIComponent(email)}`,
      method: 'GET'
    };

    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          console.log('Email verification result:', result);
          
          // Check if email is valid and deliverable
          const isValid = result.is_valid_format?.value && 
                         result.deliverability === 'DELIVERABLE' &&
                         result.is_mx_found?.value &&
                         result.is_smtp_valid?.value &&
                         !result.is_disposable_email?.value;
          
          resolve(isValid);
        } catch (error) {
          console.error('Error parsing email verification response:', error);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error verifying email:', error);
      reject(error);
    });

    req.end();
  });
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
  console.log('Making API request to College Scorecard API');
  console.log('URL (without key):', searchUrl.replace(COLLEGE_SCORECARD_API_KEY, 'API_KEY_HIDDEN'));
  
  https.get(searchUrl, (apiRes) => {
    let data = '';
    console.log('API response status code:', apiRes.statusCode);
    console.log('API response headers:', apiRes.headers);
    
    apiRes.on('data', (chunk) => {
      data += chunk;
    });
    
    apiRes.on('end', () => {
      try {
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
app.post('/api/submit-request', async (req, res) => {
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

  try {
    // Verify email using Abstract API
    const isEmailValid = await verifyEmail(body.email);
    if (!isEmailValid) {
      sendJsonResponse(res, { error: 'Invalid or non-deliverable email address' }, 400);
      return;
    }
    
    // Check if email already exists
    const existingRequest = await Request.findOne({ email: body.email });
    if (existingRequest) {
      sendJsonResponse(res, { 
        error: 'This email has already been used to submit a request' 
      }, 400);
      return;
    }
    
    // Create new request
    const request = new Request({
      college_name: body.college_name,
      building_name: body.building_name,
      email: body.email
    });
    
    await request.save();
    console.log('Request saved successfully with ID:', request._id);
    
    sendJsonResponse(res, {
      message: 'Request submitted successfully',
      request_id: request._id
    }, 201);
  } catch (error) {
    console.error('Error saving request:', error);
    sendJsonResponse(res, { error: 'Failed to save request' }, 500);
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  
  console.log('Admin login attempt for user:', username);
  
  // Validate input
  if (!username || !password) {
    sendJsonResponse(res, { error: 'Username and password are required' }, 400);
    return;
  }
  
  try {
    // Check admin credentials
    const user = await AdminUser.findOne({ username });
    
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
    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    console.log('Login successful, generated token');
    
    sendJsonResponse(res, { token });
  } catch (error) {
    console.error('Error querying admin user:', error);
    sendJsonResponse(res, { error: 'Login failed' }, 500);
  }
});

// Verify token
app.get('/api/admin/verify', authenticateToken, (req, res) => {
  sendJsonResponse(res, { message: 'Token is valid', user: req.user });
});

// Get all requests for admin
app.get('/api/admin/requests', authenticateToken, async (req, res) => {
  console.log('Fetching admin requests for user:', req.user.username);
  
  try {
    const requests = await Request.find().sort({ created_at: -1 });
    console.log(`Found ${requests.length} requests`);
    sendJsonResponse(res, requests);
  } catch (error) {
    console.error('Error fetching requests:', error);
    sendJsonResponse(res, { error: 'Failed to fetch requests' }, 500);
  }
});

// Update request status
app.put('/api/admin/requests/:id/status', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  console.log(`Updating request ${id} status to ${status}`);
  
  if (!status || !['pending', 'approved', 'rejected', 'applied', 'accepted', 'declined'].includes(status)) {
    sendJsonResponse(res, { error: 'Invalid status value' }, 400);
    return;
  }
  
  try {
    const request = await Request.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    
    if (!request) {
      sendJsonResponse(res, { error: 'Request not found' }, 404);
      return;
    }
    
    sendJsonResponse(res, { message: 'Request status updated successfully' });
  } catch (error) {
    console.error('Error updating request status:', error);
    sendJsonResponse(res, { error: 'Failed to update request status' }, 500);
  }
});

// Update status for all requests from a college
app.put('/api/admin/college/:collegeName/status', authenticateToken, async (req, res) => {
  const { collegeName } = req.params;
  const { status } = req.body;
  
  console.log(`Updating all requests for college "${collegeName}" to status ${status}`);
  
  if (!status || !['pending', 'approved', 'rejected', 'applied', 'accepted', 'declined'].includes(status)) {
    sendJsonResponse(res, { error: 'Invalid status value' }, 400);
    return;
  }
  
  try {
    const result = await Request.updateMany(
      { college_name: collegeName },
      { status }
    );
    
    if (result.nModified === 0) {
      sendJsonResponse(res, { error: 'No requests found for this college' }, 404);
      return;
    }
    
    console.log(`Updated ${result.nModified} requests for ${collegeName} to ${status}`);
    sendJsonResponse(res, { 
      message: `Status updated for all requests from ${collegeName}`,
      count: result.nModified
    });
  } catch (error) {
    console.error('Error updating college requests status:', error);
    sendJsonResponse(res, { error: 'Failed to update requests status' }, 500);
  }
});

// Public endpoint to get school statistics for the homepage
app.get('/api/public/school-stats', async (req, res) => {
  console.log('Fetching public school statistics');
  
  try {
    const statistics = await Request.aggregate([
      {
        $group: {
          _id: '$college_name',
          request_count: { $sum: 1 },
          latest_status: { $last: '$status' }
        }
      },
      {
        $project: {
          college_name: '$_id',
          request_count: 1,
          latest_status: 1,
          _id: 0
        }
      },
      {
        $sort: { college_name: 1 }
      }
    ]);
    
    console.log(`Found statistics for ${statistics.length} schools`);
    sendJsonResponse(res, statistics);
  } catch (error) {
    console.error('Error fetching school statistics:', error);
    sendJsonResponse(res, { error: 'Failed to fetch school statistics' }, 500);
  }
});

// Admin endpoint to get detailed school statistics for analytics
app.get('/api/statistics/schools', authenticateToken, async (req, res) => {
  console.log('Fetching detailed school statistics for admin analytics');
  
  try {
    const statistics = await Request.aggregate([
      {
        $group: {
          _id: '$college_name',
          request_count: { $sum: 1 },
          pending_count: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          applied_count: {
            $sum: { $cond: [{ $eq: ['$status', 'applied'] }, 1, 0] }
          },
          accepted_count: {
            $sum: { $cond: [{ $eq: ['$status', 'accepted'] }, 1, 0] }
          },
          declined_count: {
            $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] }
          },
          approved_count: {
            $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
          },
          rejected_count: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          college_name: '$_id',
          request_count: 1,
          pending_count: 1,
          applied_count: 1,
          accepted_count: 1,
          declined_count: 1,
          approved_count: 1,
          rejected_count: 1,
          _id: 0
        }
      },
      {
        $sort: { request_count: -1 }
      }
    ]);
    
    console.log(`Found detailed statistics for ${statistics.length} schools`);
    sendJsonResponse(res, statistics);
  } catch (error) {
    console.error('Error fetching detailed school statistics:', error);
    sendJsonResponse(res, { error: 'Failed to fetch school statistics' }, 500);
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}); 