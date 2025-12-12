# TradePulse Client Deployment Guide

## "Always Ready" Client Options

This guide explains how to deploy the TradePulse web client so it's **always ready** for trading floor use.

---

## Option 1: System Tray Launcher ⭐ **RECOMMENDED**

**Best for:** Trading desks that need instant access without cluttering the screen.

### Features:
- ✅ Floating tray icon (bottom-right corner)
- ✅ One-click to open/minimize
- ✅ Stays running in background
- ✅ Auto-start on Windows login
- ✅ No browser tabs clutter

### Quick Start:

```powershell
# 1. Start the server (in one terminal)
cd C:\Projects\intercom
npm run dev

# 2. Launch tray client (in another terminal)
.\start-tray-client.ps1
```

### Install Auto-Startup:

```powershell
# Run this once to install
.\install-startup.ps1

# TradePulse will now launch on every Windows login
```

### How it works:
1. Small floating icon appears in bottom-right corner
2. Click icon → popup window opens with full intercom interface
3. Click close (X) → minimizes back to tray icon
4. Always ready for instant communication

---

## Option 2: PWA (Progressive Web App)

**Best for:** Users who want a dedicated app window without extra software.

### Steps:

1. **Start the server:**
   ```powershell
   cd C:\Projects\intercom
   npm start
   ```

2. **Open browser:**
   - Navigate to: `http://localhost:5000`

3. **Install as app:**
   - **Chrome/Edge**: Click install icon (⊕) in address bar
   - **Or**: Menu (⋮) → "Install TradePulse..."

4. **App opens in standalone window** (no browser UI)

5. **Pin to taskbar** for quick access

### Auto-start PWA on Windows:

Create shortcut in Startup folder:

```
Target: "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000
Start in: C:\Projects\intercom
```

---

## Option 3: Pinned Browser Tab

**Best for:** Users comfortable with browsers, minimal setup.

### Steps:

1. Open `http://localhost:5000` in Chrome/Edge
2. Right-click tab → **"Pin tab"**
3. Tab becomes icon-only on far left
4. Cannot be accidentally closed
5. Persists between browser sessions

### Set browser to restore tabs:
- Chrome: Settings → On startup → "Continue where you left off"
- Edge: Settings → On startup → "Open tabs from the previous session"

---

## Option 4: Dedicated Browser Window

**Best for:** Kiosk-style deployment, full-screen trading terminals.

### Create Desktop Shortcut:

**Standard window:**
```
Target: "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000 --window-size=1200,800
```

**Fullscreen kiosk:**
```
Target: "C:\Program Files\Google\Chrome\Application\chrome.exe" --app=http://localhost:5000 --kiosk
```

---

## Comparison Table

| Feature | Tray Launcher | PWA | Pinned Tab | Kiosk Mode |
|---------|---------------|-----|------------|------------|
| **Always visible** | ✅ Icon always there | ⚠️ Taskbar only | ⚠️ Browser only | ✅ Fullscreen |
| **Screen space** | ✅ Minimal | ✅ Separate window | ❌ Browser overhead | ✅ Fullscreen |
| **Quick access** | ✅ One click | ✅ Alt+Tab | ⚠️ Find browser first | ✅ Always visible |
| **Auto-start** | ✅ Easy setup | ✅ Possible | ✅ Browser restores | ✅ Startup shortcut |
| **Professional look** | ✅ Very clean | ✅ Native app | ❌ Browser tabs visible | ✅ Clean |
| **Setup difficulty** | Easy | Very Easy | Easiest | Easy |

---

## Production Deployment

### For Multiple Trading Desks:

**1. Server Setup:**
```powershell
# Install server as Windows Service
npm install -g pm2-windows-service
pm2 install pm2-windows-startup
pm2 start server/index.js --name tradepulse
pm2 save
```

**2. Client Distribution:**

**Option A: Deploy tray launcher via GPO**
- Copy `tray-launcher.html` and `start-tray-client.ps1` to shared location
- Use Group Policy to add startup script

**Option B: Create MSI installer**
- Package as Windows installer
- Deploy via SCCM or Intune

**Option C: Network share**
- Put files on network drive
- Users run `\\server\tradepulse\start-tray-client.ps1`

---

## Network Configuration

### For remote access:

**1. Update server URL:**

Edit `tray-launcher.html`, line 141:
```javascript
<iframe id="appFrame" src="http://YOUR-SERVER:5000"></iframe>
```

**2. Update .env:**
```
ANNOUNCED_IP=YOUR-PUBLIC-IP
CLIENT_URL=http://YOUR-SERVER:5000
```

**3. Firewall rules:**
- Allow TCP 5000 (HTTP/WebSocket)
- Allow UDP 10000-20000 (WebRTC media)

---

## Troubleshooting

### Tray launcher not appearing:
- Check browser path in `start-tray-client.ps1`
- Try running manually: `.\start-tray-client.ps1`

### Auto-start not working:
- Check: `shell:startup` folder for TradePulse.lnk
- Verify execution policy: `Get-ExecutionPolicy`
- Run: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

### PWA not installing:
- Ensure server is running
- Try incognito/private window first
- Clear browser cache

### Connection issues:
- Verify server is running: `http://localhost:5000`
- Check firewall settings
- Disable Redis if not installed (set `REDIS_ENABLED=false` in .env)

---

## Keyboard Shortcuts (Future Enhancement)

Suggested global hotkeys:
- **Ctrl+Alt+T** - Toggle tray window
- **Ctrl+Alt+M** - Mute/Unmute
- **Ctrl+Alt+H** - Hang up call

---

## Monitoring

Check if clients are connected:
```
GET http://localhost:5000/api/redis/status
```

Shows active WebSocket connections and sessions.

---

## Security Notes

### For production:
1. ✅ Enable HTTPS (TLS certificates)
2. ✅ Use authentication (JWT tokens)
3. ✅ Restrict CORS origins in `.env`
4. ✅ Enable rate limiting
5. ✅ Use VPN for remote access

---

## Need Help?

- Server logs: Check console output
- Client issues: Open browser DevTools (F12)
- WebRTC issues: Check `chrome://webrtc-internals`

---

## What's Next?

After deploying the client:

1. **Configure authentication** - Set up LDAP/AD integration
2. **Create hunt groups** - Define trading desk groups
3. **Test calling** - Verify WebRTC connectivity
4. **Enable recording** - Configure compliance recording
5. **Setup Matrix federation** - Connect multiple sites

See `README.md` for server configuration details.

