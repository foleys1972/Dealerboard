# Group Management Interface Guide

## ✅ Complete Feature Set

Full group management with **Hunt Groups**, **Conferences**, and **IPTV Streams**!

---

## Group Types

### 1. **Hunt Group** 📞
**First to answer wins → drops to 1-to-1 call**

**Use Case:** "Get me ANY available trader NOW"

**Settings:**
- Strategy: Simultaneous or Sequential
- Ring Timeout: 5-120 seconds
- Cancel others on answer: Yes/No

**Example:**
```
Call "FX Desk" (5 traders)
→ All 5 ring simultaneously
→ Trader B answers first
→ Others stop ringing
→ 1-to-1 call with Trader B
```

---

### 2. **Conference Group** 👥
**All who answer join multi-party call**

**Use Case:** Team meetings, group discussions

**Settings:**
- Max participants: 2-100
- Auto-record: Yes/No
- Wait for host: Yes/No
- Mute on join: Yes/No

**Example:**
```
Call "Executive Team"
→ CEO, CFO, VP Sales ring
→ CFO answers → joins conference
→ VP Sales answers → joins conference
→ 3-way conference call
```

---

### 3. **Broadcast** 📻
**One-way audio/video stream (with optional IPTV)**

**Use Case:** Market data feeds, announcements

**Settings:**
- IPTV multicast address
- Port number
- Codec (G.722, G.711, Opus, PCM)

---

## Features

### Group List View

```
┌──────────────────────────────────────────────────┐
│ Group Management   📊 12 Total  8 Hunt  3 Conf  │
├──────────────────────────────────────────────────┤
│ 🔍 Search...   [All Types ▾]   [+ Create Group] │
├──────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐  │
│ │ 📞 FX Desk                          [✏️] [🗑️]│  │
│ │ FX Trading Desk - Hunt Line                 │  │
│ │ Type: Hunt Group  Members: 5                │  │
│ │ Strategy: simultaneous  Timeout: 30s        │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ ┌─────────────────────────────────────────────┐  │
│ │ 👥 Executive Team                   [✏️] [🗑️]│  │
│ │ Executive Conference Room                   │  │
│ │ Type: Conference  Members: 3                │  │
│ │ Max: 10  Auto Record: ✓  Wait for Host: ✓  │  │
│ └─────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Displays:**
- ✅ Group name and description
- ✅ Call mode (Hunt/Conference/Broadcast)
- ✅ Member count
- ✅ Specific settings based on type
- ✅ IPTV indicator if configured
- ✅ Edit and Delete buttons

---

### Create/Edit Group Modal

```
┌────────────────────────────────────────────────┐
│ ➕ Create New Group                         [×]│
├────────────────────────────────────────────────┤
│ BASIC INFORMATION                              │
│                                                │
│ Group Name *                                   │
│ [FX Desk_____________________________]         │
│                                                │
│ Description                                    │
│ [FX Trading Desk - Hunt Line__________]        │
│                                                │
│ Call Mode *                                    │
│ [Hunt Group (First to answer) ▾]              │
│ 📞 First person to answer gets 1-to-1 call    │
│                                                │
├────────────────────────────────────────────────┤
│ 📞 HUNT GROUP SETTINGS                         │
│                                                │
│ Ring Strategy        Ring Timeout (seconds)    │
│ [Simultaneous ▾]     [30__________]            │
│                                                │
│ ☑ Cancel others when first person answers     │
│                                                │
├────────────────────────────────────────────────┤
│ 👥 GROUP MEMBERS (5)                           │
│                                                │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │✓ JT      │ │✓ JS      │ │  MB      │       │
│ │John      │ │Jane      │ │Mike      │       │
│ │Ext: 1001 │ │Ext: 1002 │ │Ext: 1003 │       │
│ └──────────┘ └──────────┘ └──────────┘       │
│                                                │
├────────────────────────────────────────────────┤
│ 📺 IPTV MULTICAST STREAM                       │
│                                                │
│ ☐ Enable IPTV multicast stream                │
│                                                │
├────────────────────────────────────────────────┤
│                      [Cancel] [💾 Create Group]│
└────────────────────────────────────────────────┘
```

---

## Detailed Features

### 1. **Search & Filter**
- Search by name, description, group ID
- Filter by type (All/Hunt/Conference/Broadcast)
- Real-time filtering

### 2. **Create Hunt Group**

**Required:**
- Group name

**Configuration:**
- **Strategy:**
  - Simultaneous: All ring at once (race)
  - Sequential: Ring in priority order
- **Ring Timeout:** 5-120 seconds
- **Cancel Others:** Auto-stop ringing on first answer

**Members:**
- Click to select/deselect users
- Shows extension and name
- Visual checkmark when selected

### 3. **Create Conference Group**

**Configuration:**
- **Max Participants:** 2-100 users
- **Auto-Record:** Record all conferences
- **Wait for Host:** Conference starts when host joins
- **Mute on Join:** Join with mic muted

**Members:**
- Select conference participants
- First member = host (if wait for host enabled)

### 4. **IPTV Stream Integration**

**Enable checkbox:**
- Multicast Address: 224.0.0.0 - 239.255.255.255
- Port: 1024-65535
- Codec: G.722, G.711, Opus, PCM
- Description: What's the stream for?

**Example:**
```
☑ Enable IPTV multicast stream
Multicast Address: 239.1.1.10
Port: 5004
Codec: G.722 (Wideband)
Description: Bloomberg market data audio feed
```

### 5. **Edit Group**
- Click edit button on any group
- Change name, description
- **Switch call mode** (hunt ↔ conference)
- Add/remove members
- Update settings
- Configure IPTV

### 6. **Delete Group**
- Click delete button
- Confirmation dialog
- Permanent deletion

---

## Workflows

### Create Hunt Group:
```
1. Click "Create Group"
2. Enter:
   - Name: "Sales Desk"
   - Description: "Sales Team Hunt Line"
   - Call Mode: "Hunt Group"
3. Configure Hunt Settings:
   - Strategy: "Simultaneous"
   - Timeout: 30 seconds
   - ☑ Cancel others on answer
4. Select Members:
   - ✓ Sarah (Sales)
   - ✓ Mike (Sales)
   - ✓ Lisa (Sales)
5. Click "Create Group"
6. ✅ Group appears in list
```

### Create Conference with IPTV:
```
1. Click "Create Group"
2. Enter:
   - Name: "Market Data"
   - Call Mode: "Broadcast"
3. Enable IPTV:
   - ☑ Enable IPTV multicast stream
   - Address: 239.1.1.10
   - Port: 5004
   - Codec: G.722
   - Description: "Live market data"
4. No members needed (it's a broadcast)
5. Click "Create Group"
6. ✅ Users can now monitor this stream
```

### Change Hunt Group to Conference:
```
1. Find "FX Desk" (currently Hunt)
2. Click Edit
3. Change Call Mode to "Conference"
4. Configure conference settings:
   - Max Participants: 20
   - ☑ Auto-record
   - ☐ Wait for host
5. Click "Save Changes"
6. ✅ Now it's a conference - all answers join
```

---

## Group Card Display

Each group shows different info based on type:

### Hunt Group Card:
```
┌─────────────────────────────────────┐
│ 📞 FX Desk                   [✏️][🗑️]│
│ FX Trading Desk - Hunt Line        │
│                                    │
│ Type: Hunt Group                   │
│ Members: 5 users                   │
│ Strategy: simultaneous             │
│ Timeout: 30s                       │
└─────────────────────────────────────┘
```

### Conference Card:
```
┌─────────────────────────────────────┐
│ 👥 Executive Team            [✏️][🗑️]│
│ Executive Conference Room          │
│                                    │
│ Type: Conference                   │
│ Members: 3 users                   │
│ Max Participants: 10               │
│ Auto Record: ✓ Yes                 │
└─────────────────────────────────────┘
```

### IPTV Broadcast Card:
```
┌─────────────────────────────────────┐
│ 📺 Market Data              [✏️][🗑️]│
│ Live market data audio stream      │
│                                    │
│ Type: Broadcast                    │
│ Members: 0 users                   │
│ 📺 IPTV: 239.1.1.10:5004          │
└─────────────────────────────────────┘
```

---

## Statistics Dashboard

**Top Bar Shows:**
- **Total Groups** - All groups count
- **Hunt** - Hunt groups count
- **Conference** - Conference groups count
- **IPTV** - IPTV-enabled groups count

---

## Member Selection

**Interactive Member Grid:**
```
SELECT GROUP MEMBERS

┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│✓ JT │ │✓ JS │ │  MB │ │  LD │ │  SA │
│John │ │Jane │ │Mike │ │Lisa │ │Admin│
│1001 │ │1002 │ │1003 │ │1004 │ │9999 │
└─────┘ └─────┘ └─────┘ └─────┘ └─────┘
  ✓       ✓               +       +
Selected                Not Selected
```

**Click to toggle:**
- Green background = Selected
- Gray background = Not selected
- Shows checkmark or plus icon

---

## Call Mode Comparison in UI

When selecting call mode, shows helpful description:

```
Call Mode: [Hunt Group (First to answer) ▾]
           📞 First person to answer gets 1-to-1 call

Call Mode: [Conference (Multi-party) ▾]
           👥 All who answer join conference

Call Mode: [Broadcast (One-way) ▾]
           📻 One-way audio broadcast
```

---

## Advanced Features

### Hunt Settings:

**Simultaneous Strategy:**
```
All members ring at the same time
├─ Trader A rings 🔔
├─ Trader B rings 🔔
├─ Trader C rings 🔔
└─ First to answer wins
```

**Sequential Strategy:**
```
Members ring in priority order
1. Trader A rings 🔔 (30s timeout)
   └─ No answer → next
2. Trader B rings 🔔 (30s timeout)
   └─ Answers ✓ → Connected
3. Trader C (skipped)
```

### Conference Settings:

**Wait for Host:**
```
Enabled:
├─ Participants join waiting room
├─ When host joins → conference starts
└─ Host has controls (mute all, etc.)

Disabled:
└─ Conference starts when first person joins
```

**Mute on Join:**
```
Enabled: New joiners start muted
Disabled: New joiners start unmuted
```

---

## IPTV Multicast Configuration

### Supported Multicast Ranges:
- **224.0.0.0 - 224.0.0.255** - Local network
- **239.0.0.0 - 239.255.255.255** - Organization-local

### Common Codecs:

**G.722** (Recommended for trading):
- Wideband audio (50 Hz - 7 kHz)
- Better clarity than phone quality
- Industry standard

**Opus**:
- Highest quality
- Adaptive bitrate
- Modern codec

**G.711**:
- Standard phone quality
- Universal compatibility
- Lower bandwidth

**PCM**:
- Raw uncompressed audio
- Highest quality
- Highest bandwidth

---

## API Integration

### Create Group:
```bash
POST /api/admin/groups

Body:
{
  "name": "FX Desk",
  "description": "FX Trading Desk - Hunt Line",
  "callMode": "hunt",
  "members": ["user-001", "user-002"],
  "huntSettings": {
    "strategy": "simultaneous",
    "ringTimeout": 30000,
    "cancelOthersOnAnswer": true
  }
}
```

### Update Group:
```bash
PUT /api/admin/groups/{groupId}

Body:
{
  "callMode": "conference",  // Changed from hunt!
  "conferenceSettings": {
    "maxParticipants": 20,
    "autoRecord": true
  }
}
```

### Add IPTV Stream:
```bash
PUT /api/admin/groups/{groupId}

Body:
{
  "iptvStream": {
    "enabled": true,
    "multicastAddress": "239.1.1.10",
    "port": 5004,
    "codec": "G.722",
    "description": "Bloomberg market data"
  }
}
```

---

## Real-World Examples

### Example 1: FX Trading Desk
```
Name: FX Desk
Type: Hunt Group
Strategy: Simultaneous
Members: 5 traders
Timeout: 30s
Cancel others: ✓

Result: Fastest trader answers, others stop ringing
```

### Example 2: Executive Conference
```
Name: Executive Team
Type: Conference
Max: 10 participants
Auto-record: ✓
Wait for host: ✓ (CEO is host)
Mute on join: ✗

Result: Multi-party video conference, starts when CEO joins
```

### Example 3: Market Data Feed
```
Name: Bloomberg Audio
Type: Broadcast
IPTV: ✓
Address: 239.1.1.10
Port: 5004
Codec: G.722

Result: Users can monitor live Bloomberg audio feed
```

### Example 4: Hybrid (Hunt + IPTV)
```
Name: Sales Desk
Type: Hunt Group
Members: 8 sales reps
IPTV: ✓ (backup line)
Address: 239.1.2.20
Port: 5010

Result: Can call hunt group OR monitor IPTV stream
```

---

## User Experience

### When User Searches for Groups:
```
User types: "FX"

Shows:
- FX Desk (Hunt Group, 5 members)
- FX Market Data (IPTV Stream)
- FX Executive Team (Conference)

User adds "FX Desk" to favorites
→ Appears in quick access list
```

### When User Calls Hunt Group:
```
User clicks "Call FX Desk"
→ System checks: callMode = 'hunt'
→ Rings all 5 members simultaneously
→ First answer wins
→ Others auto-cancelled
→ 1-to-1 call established
```

### When User Calls Conference:
```
User clicks "Join Executive Team"
→ System checks: callMode = 'conference'
→ Rings all members
→ Member A answers → joins
→ Member B answers → joins
→ Multi-party conference active
```

---

## Validation & Safety

### Prevents:
- ❌ Creating group without name
- ❌ Invalid multicast address (not in 224-239 range)
- ❌ Invalid port (outside 1024-65535)
- ❌ Hunt group with 0 members
- ❌ Conference with max < 2

### Warnings:
- ⚠️ Switching call mode (hunt → conference)
- ⚠️ Removing all members
- ⚠️ Deleting group with active calls

---

## Integration with User Features

### Users Can:
- ✅ **Search** all groups (read-only)
- ✅ **Call** hunt groups
- ✅ **Join** conferences
- ✅ **Monitor** IPTV streams
- ✅ **Add to favorites**
- ✅ **See member availability**

### Users Cannot:
- ❌ Create groups
- ❌ Edit group settings
- ❌ Delete groups
- ❌ Change call mode
- ❌ Add/remove members

---

## Statistics Tracking (Future)

Each group tracks:
- Total calls received
- Average answer time
- Most active members
- Peak usage times
- Call duration averages

---

## Testing

### Test Hunt Group:
```
1. Create "Test Hunt"
2. Add 3 members
3. Set simultaneous strategy
4. Login as user
5. Call the group
6. First member to answer should get call
7. Others should stop ringing
```

### Test Conference:
```
1. Create "Test Conference"
2. Add 3 members
3. Set max = 10, auto-record = yes
4. Login as user
5. Call the conference
6. Multiple members answer
7. All should join same conference
```

### Test IPTV:
```
1. Create "Test Stream"
2. Enable IPTV
3. Enter multicast: 239.255.1.1
4. Port: 5004
5. Login as user
6. Monitor the stream
7. Backend joins multicast group
8. User receives audio
```

---

## Summary

✅ **Create Groups** - Hunt, Conference, or Broadcast  
✅ **Configure Settings** - Hunt strategy, conference options  
✅ **Manage Members** - Add/remove users easily  
✅ **IPTV Integration** - Multicast audio/video streams  
✅ **Switch Modes** - Convert hunt to conference anytime  
✅ **Search & Filter** - Find groups quickly  
✅ **Beautiful Cards** - Modern, visual interface  
✅ **Statistics** - Track group usage  

**Group management is now fully functional!** 🎉

Users can search and call these groups, while only admins can create/modify them.

