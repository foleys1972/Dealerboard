# Default / Bootstrap Login Credentials

These accounts only exist in **development**. They are never created in production:
`allowBootstrapUsers()` (`server/utils/configValidation.js`) hard-returns `false` whenever
`NODE_ENV=production`, and `server/services/auth/sessionStore.js` only seeds them when that
check passes. The "Try Admin Account" button and the demo-credentials hint on the login page
are likewise only rendered when `NODE_ENV=development`.

## Dev Bootstrap Accounts

| Username | Password    | Role           |
|----------|-------------|----------------|
| `admin`  | `admin`     | platform_admin |
| `trader1`| `trader123` | user           |

These values live in `server/services/auth/sessionStore.js` — change them there if you rotate
again, and update `scripts/test-pw-intercom.js` / `scripts/intercom-smoke.js` (manual dev smoke
scripts) and the demo hint in `client/src/pages/Login/Login.js` to match.

## Creating a Real Admin Account (staging/production)

Bootstrap users are disabled outside development, so create the first admin explicitly:

```powershell
cd C:\Projects\intercom
node server/scripts/createAdmin.js --username admin --password "YourStrongPassword123!" --role platform_admin
```

Or via environment variables: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_ROLE`, `ADMIN_EMAIL`.

## Persistence

The server uses **PostgreSQL** (see `server/db/pool.js`) and **Redis** for session/cache state —
not MongoDB. Ensure Postgres is running and `POSTGRES_*` env vars are set before starting the
server (`npm run dev`); in production, `POSTGRES_PASSWORD` is a required, validated env var
(`server/utils/configValidation.js`) with no built-in default.

## Creating Additional Users

Via the admin panel (Admin → Users → Add User), or via API:

```bash
curl -X POST http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "trader2",
    "password": "SecurePassword123!",
    "name": "Jane Trader",
    "role": "user",
    "extension": "1002",
    "department": "FX Trading"
  }'
```

## LDAP/Active Directory Integration

For production environments, integrate with your organization's LDAP/AD via `.env`:

```
LDAP_ENABLED=true
LDAP_URL=ldap://dc.yourcompany.com:389
LDAP_BIND_DN=CN=TradePulse,OU=Service Accounts,DC=yourcompany,DC=com
LDAP_BIND_PASSWORD=your_ldap_password
LDAP_SEARCH_BASE=OU=Trading,DC=yourcompany,DC=com
LDAP_SEARCH_FILTER=(sAMAccountName={{username}})
LDAP_ADMIN_GROUP=CN=TradePulse Admins,OU=Groups,DC=yourcompany,DC=com
LDAP_USER_GROUP=CN=Trading Floor,OU=Groups,DC=yourcompany,DC=com
```
