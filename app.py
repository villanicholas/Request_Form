from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from email_validator import validate_email, EmailNotValidError
import os
from dotenv import load_dotenv
import requests
from datetime import datetime

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///college_requests.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-secret-key')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = 3600  # 1 hour

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Models
class CollegeRequest(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    college_name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Admin(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password = db.Column(db.String(120), nullable=False)

# Routes
@app.route('/api/colleges/search', methods=['GET'])
def search_colleges():
    query = request.args.get('q', '')
    # Using the College Scorecard API (you'll need to get an API key)
    api_key = os.getenv('COLLEGE_SCORECARD_API_KEY')
    url = f'https://api.data.gov/ed/collegescorecard/v1/schools?api_key={api_key}&school.name={query}'
    
    try:
        response = requests.get(url)
        data = response.json()
        return jsonify(data.get('results', []))
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/requests', methods=['POST'])
def create_request():
    data = request.get_json()
    
    # Validate email
    try:
        valid = validate_email(data['email'])
        email = valid.normalized
    except EmailNotValidError as e:
        return jsonify({'error': str(e)}), 400
    
    # Check if email already exists
    if CollegeRequest.query.filter_by(email=email).first():
        return jsonify({'error': 'Email already used'}), 400
    
    # Create new request
    new_request = CollegeRequest(
        college_name=data['college_name'],
        email=email
    )
    
    try:
        db.session.add(new_request)
        db.session.commit()
        return jsonify({'message': 'Request created successfully'}), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/admin/login', methods=['POST'])
def admin_login():
    data = request.get_json()
    admin = Admin.query.filter_by(username=data['username']).first()
    
    if admin and admin.password == data['password']:  # In production, use proper password hashing
        access_token = create_access_token(identity=admin.id)
        return jsonify({'access_token': access_token}), 200
    return jsonify({'error': 'Invalid credentials'}), 401

@app.route('/api/admin/stats', methods=['GET'])
@jwt_required()
def get_stats():
    # Get request counts by college
    requests_by_college = db.session.query(
        CollegeRequest.college_name,
        db.func.count(CollegeRequest.id)
    ).group_by(CollegeRequest.college_name).all()
    
    return jsonify({
        'requests_by_college': dict(requests_by_college),
        'total_requests': CollegeRequest.query.count()
    })

# Create database tables
with app.app_context():
    db.create_all()
    # Create default admin if not exists
    if not Admin.query.first():
        admin = Admin(username='admin', password='admin123')  # Change in production
        db.session.add(admin)
        db.session.commit()

if __name__ == '__main__':
    app.run(debug=True) 