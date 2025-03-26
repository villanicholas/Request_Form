# College Merchandise Request System

A web application that allows users to request merchandise for their college, with an admin dashboard to track request statistics.

## Features

- College name autocomplete using the College Scorecard API
- Email validation to prevent spam
- Admin dashboard with request statistics
- JWT-based authentication for admin access
- Modern UI using Material-UI components

## Prerequisites

- Python 3.8 or higher
- Node.js 14 or higher
- npm or yarn

## Setup

1. Clone the repository
2. Set up the backend:
   ```bash
   # Create and activate a virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt

   # Create a .env file with the following variables:
   COLLEGE_SCORECARD_API_KEY=your_api_key_here
   JWT_SECRET_KEY=your_secret_key_here
   ```

3. Set up the frontend:
   ```bash
   cd frontend
   npm install
   ```

## Running the Application

1. Start the backend server:
   ```bash
   # From the root directory
   python app.py
   ```

2. Start the frontend development server:
   ```bash
   # From the frontend directory
   npm start
   ```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000

## Default Admin Credentials

- Username: admin
- Password: admin123

**Note**: Please change these credentials in production!

## API Keys Required

1. College Scorecard API Key:
   - Get your API key from: https://collegescorecard.ed.gov/data/documentation/
   - Add it to your .env file as COLLEGE_SCORECARD_API_KEY

## Security Notes

- In production, make sure to:
  - Use HTTPS
  - Change the default admin credentials
  - Use a strong JWT secret key
  - Implement proper password hashing
  - Set up proper CORS configuration
  - Use environment variables for sensitive data