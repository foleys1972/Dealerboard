# Default Login Credentials

## Admin Account

**Username:** `admin`  
**Password:** `TradePulse2025!`

**Access Level:** Full administrative access
- Create/delete groups
- Configure hunt groups vs. conferences
- Access recordings
- Manage users
- System settings
- Federation management
- IPTV stream configuration

---

## Test User Account

**Username:** `trader1`  
**Password:** `trader123`

**Access Level:** Standard user
- Make/receive calls
- Join hunt groups
- Monitor broadcasts
- Set DND/call forward
- Search directory
- Add favorites
- Individual volume control

---

## Setup Instructions

### 1. Start MongoDB (if not running):
```powershell
# Windows - if MongoDB is installed as service:
net start MongoDB

# Or run manually:
mongod --dbpath C:\data\db
```

### 2. Create Admin Account:
```powershell
cd C:\Projects\intercom
node server/scripts/createAdmin.js
```

### 3. Start the Server:
```powershell
npm run dev
```

### 4. Access the Application:
- **Web Interface**: http://localhost:3000 (development)
- **Production**: http://localhost:5000
- **System Tray**: Run `.\start-tray-client.ps1`

### 5. Login:
- Use **admin/TradePulse2025!** for admin access
- Use **trader1/trader123** for user testing

---

## Security Warnings

⚠️ **CHANGE DEFAULT PASSWORDS IMMEDIATELY IN PRODUCTION!**

### Change Admin Password:
```bash
# Via admin panel (after login)
Settings → Change Password

# Or via API:
PUT /api/auth/change-password
{
  "currentPassword": "TradePulse2025!",
  "newPassword": "YourNewSecurePassword123!"
}
```

### Password Requirements:
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter
- At least 1 number
- At least 1 special character

---

## Creating Additional Users

### Via Admin Panel:
```
1. Login as admin
2. Navigate to Admin → Users
3. Click "Add User"
4. Fill in details:
   - Username
   - Password
   - Name
   - Extension
   - Role (user/admin)
   - Department
5. Click "Create"
```

### Via API:
```bash
curl -X POST http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "trader2",
    "password": "SecurePassword123!",
    "name": "Jane Trader",
    "email": "jane@tradepulse.local",
    "role": "user",
    "extension": "1002",
    "department": "FX Trading"
  }'
```

### Via Script:
```javascript
// server/scripts/createUser.js
const User = require('../models/User');

const newUser = new User({
  userId: 'user-002',
  username: 'trader2',
  password: 'SecurePassword123!', // Will be auto-hashed
  name: 'Jane Trader',
  email: 'jane@tradepulse.local',
  role: 'user',
  extension: '1002',
  department: 'FX Trading'
});

await newUser.save();
```

---

## LDAP/Active Directory Integration

For production environments, integrate with your organization's LDAP/AD:

### Configuration (.env):
```
LDAP_ENABLED=true
LDAP_URL=ldap://dc.yourcompany.com:389
LDAP_BIND_DN=CN=TradePulse,OU=Service Accounts,DC=yourcompany,DC=com
LDAP_BIND_PASSWORD=your_ldap_password
LDAP_SEARCH_BASE=OU=Trading,DC=yourcompany,DC=com
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})

# Map LDAP groups to roles
LDAP_ADMIN_GROUP=CN=TradePulse Admins,OU=Groups,DC=yourcompany,DC=com
LDAP_USER_GROUP=CN=Trading Floor,OU=Groups,DC=yourcompany,DC=com
```

### How It Works:
1. User enters their corporate username/password
2. System authenticates against LDAP/AD
3. Checks group membership for role assignment
4. Creates/updates local user record
5. Issues JWT token for session

---

## Password Reset

### Admin Reset (for users):
```bash
# Via admin panel
Admin → Users → Select User → Reset Password

# Via API
POST /api/admin/users/{userId}/reset-password
{
  "newPassword": "TempPassword123!"
}
```

### Self-Service Reset:
```bash
# Via login page
Click "Forgot Password?"
Enter email
Check email for reset link
Create new password
```

---

## Role Permissions Reference

| Feature | User | Admin |
|---------|------|-------|
| **Login** | ✅ | ✅ |
| **Make Calls** | ✅ | ✅ |
| **Video Calls** | ✅ | ✅ |
| **Hunt Groups** | ✅ | ✅ |
| **Broadcasts** | ✅ | ✅ |
| **IPTV Streams** | ✅ | ✅ |
| **DND/Forward** | ✅ | ✅ |
| **Favorites** | ✅ | ✅ |
| **Create Groups** | ❌ | ✅ |
| **Access Recordings** | ❌ | ✅ |
| **User Management** | ❌ | ✅ |
| **System Settings** | ❌ | ✅ |

---

## Troubleshooting

### Can't Login?

**Check:**
1. MongoDB is running
2. Admin account was created (`node server/scripts/createAdmin.js`)
3. Server is running (`npm run dev`)
4. Using correct URL (http://localhost:5000)
5. Browser console for errors (F12)

### "User not found"?
- Run `node server/scripts/createAdmin.js` to create accounts

### "Invalid password"?
- Default password is case-sensitive: `TradePulse2025!`
- Check Caps Lock is OFF

### "Database connection failed"?
- Start MongoDB: `net start MongoDB`
- Check MongoDB URI in `.env` file

---

## Quick Start

```powershell
# 1. Ensure MongoDB is running
net start MongoDB

# 2. Create admin account (first time only)
cd C:\Projects\intercom
node server/scripts/createAdmin.js

# 3. Start the server
npm run dev

# 4. Open browser
# http://localhost:3000

# 5. Login
# Username: admin
# Password: TradePulse2025!

# 6. CHANGE THE PASSWORD!
```

---

## Support

For issues or questions:
- Check server logs in console
- Check browser console (F12)
- Review `.env` configuration
- Verify MongoDB is running
- Check firewall settings (port 5000, 3000)

---

**Remember:** This is a **video AND audio** intercom system. Both video and audio calling are fully supported!

