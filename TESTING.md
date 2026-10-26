# RubiOps Hub + Extension — Testing Plan

**Domain:** https://smartgenieai.yosanaiangati.com  
**API base:** `https://smartgenieai.yosanaiangati.com/v1`  
**Folder:** `public_html/SmartGenieAi`

---

## Phase A — Hostinger API deploy

| # | Test | Steps | Pass |
|---|------|-------|------|
| A1 | Files uploaded | `public/`, `src/`, `vendor/`, `config/.env` on server | ☐ |
| A2 | Document root | Points to `SmartGenieAi/public` OR root fallback `.htaccess` | ☐ |
| A3 | Health | `curl https://smartgenieai.yosanaiangati.com/v1/health` → `status: ok` | ☐ |
| A4 | Setup | Visit `/setup.php?token=smartgenie-setup-2026` → API key shown | ☐ |
| A5 | Setup cleanup | Delete `setup.php` → 404 | ☐ |
| A6 | Token | `POST /v1/auth/token` with `sg_live_...` → JWT returned | ☐ |
| A7 | Me | `GET /v1/auth/me` with Bearer → user email | ☐ |

---

## Phase B — API functional tests

```bash
API=https://smartgenieai.yosanaiangati.com/v1
KEY=sg_live_YOUR_KEY

# Get JWT
TOKEN=$(curl -s -X POST "$API/auth/token" \
  -H "Content-Type: application/json" \
  -d "{\"apiKey\":\"$KEY\"}" | php -r 'echo json_decode(file_get_contents("php://stdin"))->access_token;')

# Post event
curl -s -X POST "$API/events" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"platform":"vscode","category":"activity","action":"vscode.coding.active","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'

# Timeline
curl -s "$API/timeline?date=$(date +%Y-%m-%d)" -H "Authorization: Bearer $TOKEN"

# Daily output
curl -s "$API/output/daily?date=$(date +%Y-%m-%d)" -H "Authorization: Bearer $TOKEN"

# Presence
curl -s "$API/presence" -H "Authorization: Bearer $TOKEN"
```

| # | Test | Expected | Pass |
|---|------|----------|------|
| B1 | POST event | `accepted: 1` | ☐ |
| B2 | POST batch (5 events) | `accepted: 5` | ☐ |
| B3 | GET timeline | Events listed for today | ☐ |
| B4 | GET output/daily | `codingMinutes`, `outputScore` | ☐ |
| B5 | GET presence | `state: active` or `coding` | ☐ |
| B6 | POST consent | `accepted: true` | ☐ |
| B7 | Web dashboard | `/dashboard.php` shows stats | ☐ |

---

## Phase C — VS Code extension tests

| # | Test | Steps | Pass |
|---|------|-------|------|
| C1 | Compile | `npm run compile` — no errors | ☐ |
| C2 | F5 debug | Extension activates, sidebar loads | ☐ |
| C3 | Connect ADO | Connect Azure DevOps works | ☐ |
| C4 | Connect Hub | Command: Connect RubiOps Hub → paste API key | ☐ |
| C5 | Consent | Modal appears before API key input | ☐ |
| C6 | Dashboard hub tile | "My Coding Day" shows coding min / score | ☐ |
| C7 | Coding track | Type in editor 2 min → refresh dashboard → events increase | ☐ |
| C8 | Idle track | Stop typing 5+ min → idle event in timeline | ☐ |
| C9 | Work item | Change state → `workitem_state_changed` in timeline | ☐ |
| C10 | Standup | Copy standup → `standup_copied` event | ☐ |
| C11 | AI agent | Open in AI Agent → `ai_agent_opened` event | ☐ |
| C12 | Disconnect | Disconnect Hub → tracking stops | ☐ |

---

## Phase D — End-to-end day simulation (30 min)

1. Connect ADO + Hub
2. Code in VS Code for 10 minutes
3. Change one work item state to Done
4. Copy standup summary
5. Open dashboard — verify hub stats updated
6. Open https://smartgenieai.yosanaiangati.com/dashboard.php
7. Confirm timeline matches extension activity

| Metric | Expected |
|--------|----------|
| codingMinutes | > 0 |
| eventCount | >= 5 |
| tasksClosed | >= 0 |
| outputScore | > 0 |

---

## Phase E — Regression (existing features)

| # | Feature | Pass |
|---|---------|------|
| E1 | Dashboard work filters | ☐ |
| E2 | Task Search Bot | ☐ |
| E3 | My Tasks tree | ☐ |
| E4 | Time logging on state change | ☐ |
| E5 | Open in AI Agent | ☐ |

---

## Bug Watch + Broken Verify (v1.3)

Prod URL (hardcoded default): `https://preprod.internal.example.com`

| # | Test | Expected | Done |
|---|------|----------|------|
| B1 | Connect ADO, reload extension | Output: `BugWatch started` | ☐ |
| B2 | Command: **Run Bug Autopilot** (or wait for poll) | Open Bugs get `TodayAssigned` — no clicks after start | ☐ |
| B3 | Open Bug Description in ADO | Work Plan + Broken Verify blocks — **no discussion comments** | ☐ |
| B4 | Window notification | OS/VS Code notify for tag / plan / verify | ☐ |
| B5 | Tag Bug with **Broken** + Run Autopilot | Downloads images/videos, builds test cases, runs preprod, attaches screenshots, **posts ADO comment** | ☐ |
| B6 | Dashboard Today | Bugs with TodayAssigned appear (not due-date only) | ☐ |
| B7 | Comment content | Includes media review, test cases, verdict, screenshot names | ☐ |

Settings: `bugWatch.*`, `brokenVerify.prodUrl`

Optional Playwright: `npx playwright install chromium` (falls back to HTTP smart test if missing)

---

## Known limits (v1)

- Teams / email sensors not built yet
- Remote MySQL from PC blocked (use setup.php on server)
- Activity flush every 2 min or 20 events
- SQL Server only for enterprise deploy

---

## Rollback

1. Extension: set `hub.enabled: false`
2. Server: remove `config/.env` to disable API
3. DB: drop tables via phpMyAdmin if needed
