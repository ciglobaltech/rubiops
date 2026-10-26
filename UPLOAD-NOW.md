# Publish API to smartgenieai.yosanaiangati.com — DO THIS NOW

**Current status:** `/v1/health` returns **404** — API not uploaded yet.

**Package ready:** `hostinger-publish.zip` (project root)

---

## Option A — hPanel File Manager (5 minutes)

1. Login **Hostinger hPanel**
2. **Files** → **File Manager**
3. Open `public_html` → folder **`SmartGenieAi`**
   - If `SmartGenieAi` does not exist → **New Folder** → `SmartGenieAi`
4. **Delete** old default `index.html` / `default.php` inside `SmartGenieAi` (if any)
5. **Upload** `hostinger-publish.zip`
6. **Extract** zip inside `SmartGenieAi`
7. Move files: open `hostinger-publish` folder → **Select All** → **Move** to `SmartGenieAi` (parent)
8. Confirm structure:

```
public_html/SmartGenieAi/
├── index.php          ← API router
├── setup.php
├── dashboard.php
├── .htaccess
├── config/.env        ← must exist (included in zip if built locally)
├── vendor/
├── src/
└── database/
```

9. **Subdomain document root** must be `public_html/SmartGenieAi`
   - hPanel → Websites → smartgenieai.yosanaiangati.com → **Document root** → `SmartGenieAi`

10. **Run setup** in browser:
```
https://smartgenieai.yosanaiangati.com/setup.php?token=smartgenie-setup-2026
```

11. **Delete** `setup.php` after you copy the API key

12. **Test:**
```bash
curl https://smartgenieai.yosanaiangati.com/v1/health
```

Expected:
```json
{"status":"ok","db":"connected"}
```

---

## Option B — FTP (FileZilla)

| Field | Value |
|-------|-------|
| Host | `ftp.yosanaiangati.com` or shown in hPanel → FTP Accounts |
| User | `u170769806` (or FTP username from hPanel) |
| Port | 21 |
| Remote path | `/domains/yosanaiangati.com/public_html/SmartGenieAi/` |

Upload **contents** of `hostinger-publish/` folder.

---

## After health OK

```bash
# Get JWT
curl -X POST https://smartgenieai.yosanaiangati.com/v1/auth/token \
  -H "Content-Type: application/json" \
  -d '{"apiKey":"sg_live_YOUR_KEY"}'
```

VS Code → **SmartGenie AI: Connect SmartGenie Hub** → paste API key

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| 404 on /v1/health | Wrong folder or missing `.htaccess` / `index.php` |
| Default Hostinger page | Document root not pointing to `SmartGenieAi` |
| 500 error | `vendor/` missing or `config/.env` missing |
| DB fail on setup | `DB_HOST=localhost` in `.env` |

---

## Rebuild zip locally

```bash
bash hub/scripts/build-hostinger-flat.sh
```

Creates fresh `hostinger-publish.zip`.


//sg_live_52a2e51461581b8abb8cd1719e8004cfdeb002b27c8b6be7