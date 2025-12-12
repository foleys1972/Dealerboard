/**
 * Create Default Admin Account
 * Run this once to create the initial admin user
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Simple User schema (create proper User model later)
const UserSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  email: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  name: String,
  extension: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);

async function createAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/trading-intercom';
    console.log('Connecting to MongoDB:', mongoUri);
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    
    console.log('Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ username: 'admin' });
    
    if (existingAdmin) {
      console.log('Admin account already exists!');
      console.log('Username: admin');
      console.log('To reset password, delete the user and run this script again.');
      process.exit(0);
    }

    // Create admin user
    const adminPassword = 'TradePulse2025!'; // Default password - CHANGE IN PRODUCTION!
    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    const admin = new User({
      userId: 'admin-001',
      username: 'admin',
      password: hashedPassword,
      email: 'admin@tradepulse.local',
      role: 'admin',
      name: 'System Administrator',
      extension: '9999'
    });

    await admin.save();

    console.log('✅ Admin account created successfully!');
    console.log('');
    console.log('═══════════════════════════════════');
    console.log('   DEFAULT ADMIN CREDENTIALS');
    console.log('═══════════════════════════════════');
    console.log('Username: admin');
    console.log('Password: TradePulse2025!');
    console.log('═══════════════════════════════════');
    console.log('');
    console.log('⚠️  IMPORTANT: Change this password immediately!');
    console.log('');

    // Create a test user too
    const testUserPassword = 'trader123';
    const testUserHashed = await bcrypt.hash(testUserPassword, 10);

    const testUser = new User({
      userId: 'user-001',
      username: 'trader1',
      password: testUserHashed,
      email: 'trader1@tradepulse.local',
      role: 'user',
      name: 'Test Trader',
      extension: '1001'
    });

    await testUser.save();

    console.log('✅ Test user created:');
    console.log('Username: trader1');
    console.log('Password: trader123');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();

