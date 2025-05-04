const mongoose = require('mongoose');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/merchandise', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('Error connecting to MongoDB:', err);
});

// Request Schema
const requestSchema = new mongoose.Schema({
    college_name: { type: String, required: true },
    building_name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    status: { type: String, default: 'pending', enum: ['pending', 'applied', 'accepted', 'declined', 'approved', 'rejected'] },
    created_at: { type: Date, default: Date.now }
});

// Admin User Schema
const adminUserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// Create models
const Request = mongoose.model('Request', requestSchema);
const AdminUser = mongoose.model('AdminUser', adminUserSchema);

// Create default admin user if none exists
async function createDefaultAdmin() {
    const count = await AdminUser.countDocuments();
    if (count === 0) {
        const admin = new AdminUser({
            username: 'admin',
            password: 'admin123'
        });
        await admin.save();
        console.log('Default admin user created');
    } else {
        console.log('Admin user exists in database');
    }
}

createDefaultAdmin().catch(console.error);

module.exports = { Request, AdminUser }; 