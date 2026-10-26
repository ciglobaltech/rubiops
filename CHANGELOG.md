# Changelog

All notable changes to **RubiOps** are documented in this file.

## [1.0.0] - 2026-10-26

### Added
- Rebranded extension to **RubiOps**.
- Updated extension icon, activity bar, command categories, chat participant (`@rubiops`), language model tools, and workspace config (`.rubiops.json`).
- Updated status bar, hints, hub connection endpoints, and AI integration to RubiOps branding.


### Added

- Publisher contact details in README and `package.json` (Balamurugan, email, WhatsApp)
- Screenshots embedded in README so images display on Marketplace and in VS Code Details

### Changed

- Removed org-specific example names from connect guides

## [1.0.8] - 2026-07-12

### Fixed

- **Menu / My Tasks not loading after VSIX install** — `axios` was excluded from the package (`.vscodeignore` blocked `node_modules`); production dependencies are now bundled in the VSIX

## [1.0.7] - 2026-07-12

### Fixed

- **Sidebar Menu / My Tasks not loading** — register webview and tree providers before panels; remove restrictive `activationEvents` so VS Code auto-activates from views/commands
- Menu webview shows loading state immediately and refreshes when the sidebar becomes visible

## [1.0.6] - 2026-07-12

### Fixed

- **Refresh command not found** — `devopsQuickUpdate.refresh` registers on the first line of activation
- Added explicit `activationEvents` (`onStartupFinished`, views, refresh/connect commands)
- Sidebar Refresh uses webview message (works even if command palette path fails)
- Activation errors show a clear message instead of failing silently

## [0.1.7] - 2026-07-12

### Improved

- Marketplace README — complete feature list in words + 5 screenshots (dashboard, work now, task bot, query, AI agent)

## [0.1.6] - 2026-07-12

### Improved

- Marketplace README — full feature list, connect/PAT guide, publisher details, AI agent docs

## [0.1.5] - 2026-07-12

### Improved

- **Connect onboarding guide** on Dashboard, sidebar, and panels — step-by-step PAT instructions
- **How to get PAT** button opens your Azure DevOps token page (or Microsoft docs)
- **3-step connect wizard** — org URL → PAT (with scope help) → project name
- Warns when no workspace folder is open before connecting

## [0.1.4] - 2026-07-12

### Added

- **Open in AI Agent** on work item details — builds an implementation prompt from description, acceptance criteria, and workspace code folder
- **Copy AI Prompt** button for clipboard-only workflow
- Auto-detects **Cursor Composer**, **GitHub Copilot Chat**, **VS Code Chat**, **Continue**, and **Cline (Claude)**
- Acceptance criteria shown on task details (from Azure DevOps)
- Setting `devopsQuickUpdate.ai.preferredAgent` to choose default agent

## [0.1.3] - 2026-07-12

### Added

- **Task Search Bot** — natural language search for backlog and tasks (e.g. `printer integration on backlog`)
- Searches title, description, and tags; ranks results by relevance
- Understands backlog, assigned-to-me, blocked, and in-progress intents
- Click any result to open full work item details

## [0.1.2] - 2026-07-12

### Added

- **My Tasks** sidebar tree — click a task to open details; right-click for Open / Change State
- **Focus My Tasks Sidebar** command and menu shortcut
- Time log settings: `timeLog.enabled`, `timeLog.required`, `timeLog.onCompleteOnly`
- Dashboard remembers your last-selected filter tile across sessions

### Improved

- Clearer PAT error messages (401/403) listing required Azure DevOps token scopes
- Time logging gracefully skips Completed Work when the work item type does not support it
- Tree clicks select the task and pass ID reliably to `OPEN_WORK_ITEM`
- Sidebar tree refreshes after state changes and connect

### Fixed

- **Refresh command not found** — commands register before sidebar views load
- Extension activation — removed empty `activationEvents` so VS Code activates when the sidebar opens

## [0.1.0] - 2026-07-12

### Added

- Azure DevOps connection with PAT stored in VS Code Secret Storage (per workspace folder)
- **Developer Workboard** dashboard with clickable stat tiles and filtered work lists
- **SmartGenie AI** panel: task recommendations, standup preview, real-time alerts, git context
- Copy standup summary (yesterday, done today, open work, blockers, in progress)
- Query & Search panel with org-driven project, area, sprint, state, and type filters
- Work item details: edit state, assignee, description, discussion comments
- Time logging on status change (Azure DevOps Completed Work / Remaining Work)
- Git branch creation prompt when moving to active/in-progress states
- AB# commit message helper and branch-to-work-item linking
- Activity audit comments on work item updates (attributed to SmartGenie AI)

### Dashboard filters

- Today (open vs done today split view)
- Work Now (overdue + due today)
- Done Today, Overdue, Due Today, In Progress, Blocked, On Hold
- High Priority, Stale, This Week, All Pending
- Chart bars by type, state, and sprint
