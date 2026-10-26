"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokenDeepTestService = void 0;
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
const descriptionBlocks_1 = require("../utils/descriptionBlocks");
const workspaceConfig_1 = require("../utils/workspaceConfig");
function getLoginCredentials(workItem) {
    const projectConfig = (0, workspaceConfig_1.loadWorkspaceProjectConfig)();
    const cfg = vscode.workspace.getConfiguration('devopsQuickUpdate');
    const settingsMobile = projectConfig?.testing?.loginMobile ||
        cfg.get('brokenVerify.loginMobile')?.trim() ||
        '';
    const settingsPassword = projectConfig?.testing?.loginPassword ||
        cfg.get('brokenVerify.loginPassword')?.trim() ||
        '';
    const ticketText = workItem
        ? stripHtml(`${workItem.description}\n${workItem.acceptanceCriteria ?? ''}`)
        : '';
    const fromTicket = parseLoginFromTicket(ticketText);
    if (fromTicket) {
        return { ...fromTicket, source: 'ticket' };
    }
    return { mobile: settingsMobile, password: settingsPassword, source: 'settings' };
}
/** Pull mobile + password from Repro Steps text when present. */
function parseLoginFromTicket(text) {
    if (!text) {
        return undefined;
    }
    const patterns = [
        /login\s+using\s+number\s+(\d{8,15})\s+and\s+password\s*[:\-]?\s*(\S+)/i,
        /(?:mobile|phone|number)\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{8,15}).{0,80}password\s*[:\-]?\s*([^\s,<]+)/i,
        /password\s*[:\-]?\s*([^\s,<]+).{0,80}(?:mobile|phone|number)\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{8,15})/i,
    ];
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match) {
            continue;
        }
        // Pattern 3 swaps capture order.
        if (pattern.source.startsWith('password')) {
            return { password: match[1].replace(/[),.;]+$/g, ''), mobile: match[2] };
        }
        return { mobile: match[1], password: match[2].replace(/[),.;]+$/g, '') };
    }
    return undefined;
}
/**
 * Broken-tag deep flow with web app preprod login:
 * ticket + media → test cases → login → screenshots → ADO comment
 */
class BrokenDeepTestService {
    async run(client, workItem, prodUrl, log) {
        const checkedAt = new Date().toISOString();
        log(`Deep Broken test #${workItem.id}: loading attachments…`);
        const attachments = await client.listAttachments(workItem.id);
        const mediaSummary = [];
        const images = [];
        const videos = [];
        for (const att of attachments) {
            if (att.kind === 'image') {
                images.push(att);
                mediaSummary.push(`Image reviewed: ${att.name}`);
                try {
                    const buf = await client.downloadAttachment(att.url);
                    mediaSummary.push(`  · downloaded ${att.name} (${buf.length} bytes)`);
                }
                catch (error) {
                    mediaSummary.push(`  · download failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            else if (att.kind === 'video') {
                videos.push(att);
                mediaSummary.push(`Video inventoried as repro evidence: ${att.name}`);
                try {
                    const buf = await client.downloadAttachment(att.url);
                    mediaSummary.push(`  · downloaded ${att.name} (${buf.length} bytes)`);
                }
                catch (error) {
                    mediaSummary.push(`  · download failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            else {
                mediaSummary.push(`Other attachment noted: ${att.name}`);
            }
        }
        if (attachments.length === 0) {
            mediaSummary.push('No attachments — test cases from description only.');
        }
        const testCases = buildTestCases(workItem, prodUrl, images, videos);
        log(`  prepared ${testCases.length} test case(s) including web login`);
        // Keep Description short (no giant script dump in Discussion).
        const withScript = (0, descriptionBlocks_1.upsertDescriptionBlock)(workItem.description, 'Test Script', [
            `Bug #${workItem.id}`,
            `Env: ${prodUrl}`,
            `Cases: ${testCases.map((t) => t.id).join(', ')}`,
            `Prepared: ${new Date().toISOString()}`,
        ].join('\n'));
        await client.updateWorkItemDescription(workItem.id, withScript);
        log('  Description updated: short Test Script block');
        const runDir = fs.mkdtempSync(path.join(os.tmpdir(), `rubiops-broken-${workItem.id}-`));
        let engine = 'http';
        let httpStatus;
        let pageTitle;
        let evidence;
        let verdict;
        let loggedIn = false;
        const screenshotPaths = [];
        try {
            const pw = await runPlaywrightSuite(prodUrl, workItem, testCases, runDir, log);
            if (pw) {
                engine = 'playwright';
                httpStatus = pw.httpStatus;
                pageTitle = pw.pageTitle;
                evidence = pw.evidence;
                verdict = pw.verdict;
                loggedIn = Boolean(pw.loggedIn);
                screenshotPaths.push(...pw.screenshotPaths.slice(0, 3));
                applyCaseStatuses(testCases, verdict, loggedIn, evidence);
            }
            else {
                log('  Playwright unavailable — credentials exist but browser login was skipped');
                const http = await runHttpSuite(prodUrl, workItem);
                httpStatus = http.httpStatus;
                pageTitle = http.pageTitle;
                const creds = getLoginCredentials(workItem);
                evidence =
                    `Login NOT attempted (no browser). Credentials were available ` +
                        `(${creds.source}: mobile ${creds.mobile}). ` +
                        `Install/reinstall RubiOps so Playwright can open web app and type them. ` +
                        `HTTP probe: ${http.evidence}`;
                // Do not claim "Broken now" when we could not actually test.
                verdict = 'needs_manual_check';
                applyCaseStatuses(testCases, verdict, false, evidence);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            verdict = 'needs_manual_check';
            evidence = `Test run error: ${message}`;
            applyCaseStatuses(testCases, verdict, false, evidence);
        }
        const screenshotNames = [];
        const screenshotUrls = [];
        for (const shot of screenshotPaths) {
            const fileName = `RubiOps-${workItem.id}-${path.basename(shot)}`;
            try {
                const content = fs.readFileSync(shot);
                const url = await client.uploadAndAttachFile(workItem.project, workItem.id, fileName, content);
                screenshotNames.push(fileName);
                screenshotUrls.push(url);
                log(`  attached screenshot ${fileName}`);
            }
            catch (error) {
                log(`  screenshot upload failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const result = {
            verdict,
            prodUrl,
            checkedAt,
            engine,
            testCases,
            mediaSummary,
            screenshotNames,
            screenshotUrls,
            evidence,
            httpStatus,
            pageTitle,
            loggedIn,
        };
        await client.addWorkItemComment(workItem.project, workItem.id, formatBrokenTestComment(workItem, result));
        log('  ADO comment posted: short RubiOps report + screenshots');
        try {
            fs.rmSync(runDir, { recursive: true, force: true });
        }
        catch {
            // ignore
        }
        return result;
    }
}
exports.BrokenDeepTestService = BrokenDeepTestService;
function buildTestCases(workItem, prodUrl, images, videos) {
    const cases = [];
    const description = stripRubiOpsNoise(stripHtml(workItem.description));
    const acceptance = stripHtml(workItem.acceptanceCriteria ?? '');
    const urls = extractUrls(`${description}\n${acceptance}`).filter((u) => !/dev\.azure\.com|visualstudio\.com/i.test(u));
    const { mobile } = getLoginCredentials(workItem);
    cases.push({
        id: 'TC-00',
        title: 'Login to preprod environment',
        steps: [
            `Navigate to ${prodUrl}`,
            `Enter Mobile No: ${mobile}`,
            'Enter Password from RubiOps settings',
            'Click Login',
            'Screenshot after login',
        ],
        expected: 'Authenticated web UI (not stuck on Welcome Back login)',
        source: 'login',
    });
    cases.push({
        id: 'TC-01',
        title: 'Check bug after login',
        steps: [
            `Look for: ${truncate(workItem.title, 120)}`,
            'Navigate relevant module if needed',
            'Screenshot result',
        ],
        expected: acceptance ? truncate(acceptance, 160) : 'Confirm if bug still present',
        source: 'ticket',
    });
    urls.slice(0, 2).forEach((url, index) => {
        cases.push({
            id: `TC-URL-${index + 1}`,
            title: 'Open URL from ticket',
            steps: [`Navigate to ${url}`, 'Screenshot'],
            expected: 'Reachable while logged in',
            source: 'url',
        });
    });
    if (images[0]) {
        cases.push({
            id: 'TC-IMG-1',
            title: `Compare UI to ${images[0].name}`,
            steps: ['Authenticated session', 'Screenshot live UI'],
            expected: 'Match broken image → Broken now; else Already available',
            source: 'image',
        });
    }
    if (videos[0]) {
        cases.push({
            id: 'TC-VID-1',
            title: `Follow video ${videos[0].name}`,
            steps: ['Follow recorded repro', 'Screenshot after action'],
            expected: 'Same failure as video or healthy flow',
            source: 'video',
        });
    }
    return cases;
}
function stripRubiOpsNoise(text) {
    return text
        .replace(/---\s*(?:RubiOps|DEVOPS\s*NEXA(?:\s*AI)?|SmartGenie)[\s\S]*?---/gi, ' ')
        .replace(/(?:RubiOps|DEVOPS\s*NEXA(?:\s*AI)?|SmartGenie)\s+Test Script[\s\S]*?(?=\n\S|$)/gi, ' ')
        .replace(/Work Plan[\s\S]*?(?=\n\S|$)/gi, ' ')
        .replace(/Broken Verify[\s\S]*?(?=\n\S|$)/gi, ' ')
        .trim();
}
async function runPlaywrightSuite(prodUrl, workItem, testCases, runDir, log) {
    const chromium = loadPlaywrightChromium(log);
    if (!chromium) {
        return undefined;
    }
    const { mobile, password, source } = getLoginCredentials(workItem);
    const browser = await launchChromium(chromium, log);
    if (!browser) {
        return undefined;
    }
    const screenshotPaths = [];
    const consoleErrors = [];
    try {
        const page = await browser.newPage();
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        log(`  open ${prodUrl}`);
        const response = await page
            .goto(prodUrl, { waitUntil: 'networkidle', timeout: 60_000 })
            .catch(async () => page.goto(prodUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 }));
        const httpStatus = response?.status();
        await page.waitForTimeout(1500);
        const loginPagePath = path.join(runDir, '01-login.png');
        await page.screenshot({ path: loginPagePath, fullPage: true });
        screenshotPaths.push(loginPagePath);
        log(`  login mobile ${mobile} (from ${source})`);
        const loggedIn = await loginToWebApp(page, mobile, password, log);
        await page.waitForTimeout(2500);
        const afterLoginPath = path.join(runDir, '02-after-login.png');
        await page.screenshot({ path: afterLoginPath, fullPage: true });
        screenshotPaths.push(afterLoginPath);
        if (!loggedIn) {
            return {
                verdict: 'needs_manual_check',
                httpStatus,
                pageTitle: await page.title(),
                evidence: 'Login failed — still on Welcome Back / credentials form',
                screenshotPaths,
                loggedIn: false,
            };
        }
        log('  login OK');
        for (const tc of testCases.filter((t) => t.id.startsWith('TC-URL'))) {
            const urlStep = tc.steps.find((s) => s.startsWith('Navigate to http'));
            const url = urlStep?.replace(/^Navigate to\s+/i, '').trim();
            if (!url) {
                continue;
            }
            try {
                await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
                await page.waitForTimeout(1000);
            }
            catch {
                // continue
            }
        }
        await page.waitForTimeout(800);
        const reproPath = path.join(runDir, '03-result.png');
        await page.screenshot({ path: reproPath, fullPage: true });
        screenshotPaths.push(reproPath);
        const pageTitle = await page.title();
        const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 8000);
        const scored = scoreAgainstTicket({
            httpStatus,
            pageTitle,
            bodyText,
            consoleErrors,
            workItem,
            loggedIn: true,
        });
        return { ...scored, httpStatus, pageTitle, screenshotPaths, loggedIn: true };
    }
    finally {
        await browser.close();
    }
}
function loadPlaywrightChromium(log) {
    const candidates = [
        'playwright',
        path.join(__dirname, '..', '..', 'node_modules', 'playwright'),
        path.join(__dirname, '..', 'node_modules', 'playwright'),
    ];
    try {
        const ext = vscode.extensions.getExtension('CIGlobalTechnologies.rubiops') ||
            vscode.extensions.getExtension('MessageToBala.rubiops') ||
            vscode.extensions.getExtension('MessageToBala.smart-genie-ai');
        if (ext) {
            candidates.unshift(path.join(ext.extensionPath, 'node_modules', 'playwright'));
        }
    }
    catch {
        // ignore
    }
    for (const candidate of candidates) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const mod = require(candidate);
            if (mod?.chromium) {
                log(`  Playwright loaded from ${candidate === 'playwright' ? 'node_modules' : candidate}`);
                return mod.chromium;
            }
        }
        catch {
            // try next
        }
    }
    log('  Playwright module not found in extension package');
    return undefined;
}
async function launchChromium(chromium, log) {
    const attempts = [
        { headless: true, channel: 'chrome' },
        { headless: true, channel: 'msedge' },
        { headless: true },
    ];
    for (const opts of attempts) {
        try {
            const browser = await chromium.launch(opts);
            log(`  browser launched (${JSON.stringify(opts)})`);
            return browser;
        }
        catch (error) {
            log(`  launch failed ${JSON.stringify(opts)}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    // Last resort: install Chromium into user cache, then retry bundled.
    try {
        log('  installing Playwright Chromium (one-time)…');
        const { execFileSync } = require('child_process');
        const cliCandidates = [
            path.join(__dirname, '..', '..', 'node_modules', 'playwright', 'cli.js'),
            path.join(__dirname, '..', 'node_modules', 'playwright', 'cli.js'),
        ];
        try {
            const ext = vscode.extensions.getExtension('CIGlobalTechnologies.rubiops') ||
                vscode.extensions.getExtension('MessageToBala.rubiops') ||
                vscode.extensions.getExtension('MessageToBala.smart-genie-ai');
            if (ext) {
                cliCandidates.unshift(path.join(ext.extensionPath, 'node_modules', 'playwright', 'cli.js'));
            }
        }
        catch {
            // ignore
        }
        const cli = cliCandidates.find((p) => fs.existsSync(p));
        if (cli) {
            execFileSync(process.execPath, [cli, 'install', 'chromium'], {
                stdio: 'pipe',
                timeout: 300_000,
            });
            const browser = await chromium.launch({ headless: true });
            log('  Chromium installed and launched');
            return browser;
        }
    }
    catch (error) {
        log(`  Chromium install failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    return undefined;
}
async function loginToWebApp(page, mobile, password, log) {
    try {
        const mobileInput = await resolveMobileInput(page);
        const passwordInput = await resolvePasswordInput(page);
        log(`  typing mobile ${mobile} (React-safe clear + type)`);
        await fillReactInput(page, mobileInput, mobile);
        const mobileValue = await mobileInput.inputValue().catch(() => '');
        if (mobileValue.replace(/\D/g, '') !== mobile.replace(/\D/g, '')) {
            log(`  mobile field mismatch after type: got "${mobileValue}" expected "${mobile}" — retry`);
            await fillReactInput(page, mobileInput, mobile, true);
        }
        log('  typing password');
        await fillReactInput(page, passwordInput, password);
        const finalMobile = await mobileInput.inputValue().catch(() => '');
        log(`  form values before Login: mobile="${finalMobile}" passwordLen=${password.length}`);
        if (finalMobile.replace(/\D/g, '') !== mobile.replace(/\D/g, '')) {
            log(`  abort click — mobile still wrong ("${finalMobile}")`);
            return false;
        }
        try {
            await page.getByRole('button', { name: /^login$/i }).click({ timeout: 5000 });
        }
        catch {
            await page.locator('button[type="submit"]').first().click({ timeout: 5000 });
        }
        // Wait for SPA to leave the login shell.
        for (let i = 0; i < 12; i++) {
            await page.waitForTimeout(1000);
            const body = ((await page.locator('body').innerText().catch(() => '')) || '').toLowerCase();
            const stillLogin = /welcome back/.test(body) &&
                (/enter your credentials/.test(body) || /mobile no/.test(body));
            if (!stillLogin) {
                log(`  post-login url: ${page.url()}`);
                return true;
            }
            // Retry click once if still stuck (slow API / missed first click).
            if (i === 4) {
                log('  still on login — click Login again');
                try {
                    await page.getByRole('button', { name: /^login$/i }).click({ timeout: 3000 });
                }
                catch {
                    // ignore
                }
            }
        }
        log('  still on login form after wait');
        return false;
    }
    catch (error) {
        log(`  login error: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
async function resolveMobileInput(page) {
    try {
        const byLabel = page.getByLabel(/mobile/i);
        if ((await byLabel.count()) > 0) {
            return byLabel.first();
        }
    }
    catch {
        // continue
    }
    try {
        const byPh = page.getByPlaceholder(/9876543210|mobile|phone/i);
        if ((await byPh.count()) > 0) {
            return byPh.first();
        }
    }
    catch {
        // continue
    }
    return page.locator('input[type="tel"], input[type="text"], input:not([type="password"])').first();
}
async function resolvePasswordInput(page) {
    try {
        const byLabel = page.getByLabel(/password/i);
        if ((await byLabel.count()) > 0) {
            return byLabel.first();
        }
    }
    catch {
        // continue
    }
    return page.locator('input[type="password"]').first();
}
/**
 * The web application uses React controlled inputs — Playwright fill() often leaves
 * leftover placeholder digits (e.g. 9678543210 instead of 7538886343).
 */
async function fillReactInput(page, locator, value, forceNative = false) {
    await locator.click({ clickCount: 1 });
    await page.keyboard.press('Meta+A').catch(async () => page.keyboard.press('Control+A'));
    await page.keyboard.press('Backspace');
    try {
        await locator.fill('');
    }
    catch {
        // ignore
    }
    if (!forceNative) {
        await page.keyboard.type(value, { delay: 40 });
        const typed = await locator.inputValue().catch(() => '');
        if (typed === value) {
            return;
        }
    }
    // Native setter + input/change events so React state updates (runs in browser).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await locator.evaluate((el, v) => {
        const win = el.ownerDocument.defaultView;
        const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')?.set;
        setter?.call(el, v);
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
    }, value);
}
async function runHttpSuite(prodUrl, workItem) {
    const response = await axios_1.default.get(prodUrl, {
        timeout: 30_000,
        validateStatus: () => true,
        responseType: 'text',
        transformResponse: [(d) => d],
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
        },
    });
    const html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
    const pageTitle = extractTitle(html);
    const bodyText = stripHtml(html).slice(0, 8000);
    if (response.status === 403) {
        return {
            verdict: 'broken_now',
            httpStatus: 403,
            pageTitle,
            evidence: 'HTTP 403 without browser login — use Playwright path',
        };
    }
    return scoreAgainstTicket({
        httpStatus: response.status,
        pageTitle,
        bodyText,
        consoleErrors: [],
        workItem,
        loggedIn: false,
    });
}
function scoreAgainstTicket(input) {
    const { httpStatus, pageTitle, bodyText, consoleErrors, workItem, loggedIn } = input;
    const hay = `${pageTitle ?? ''}\n${bodyText}`.toLowerCase();
    const symptoms = buildSymptoms(workItem);
    if (httpStatus !== undefined && httpStatus >= 400) {
        return { verdict: 'broken_now', evidence: `HTTP ${httpStatus}` };
    }
    if (/\b(something went wrong|unexpected error|application error)\b/i.test(hay) || consoleErrors.length > 2) {
        return {
            verdict: 'broken_now',
            evidence: consoleErrors.length
                ? `Console errors: ${consoleErrors.slice(0, 3).join(' | ')}`
                : 'Error shell on page',
        };
    }
    const matched = symptoms.filter((s) => s.length >= 4 && hay.includes(s.toLowerCase()));
    if (matched.length >= 1) {
        return {
            verdict: 'broken_now',
            evidence: `Symptoms still present after${loggedIn ? ' login' : ''}: ${matched.slice(0, 5).join(', ')}`,
        };
    }
    if (loggedIn) {
        return {
            verdict: 'already_available',
            evidence: 'Logged into preprod successfully; ticket symptoms not found in authenticated UI text',
        };
    }
    if (httpStatus !== undefined && httpStatus >= 200 && httpStatus < 400) {
        return {
            verdict: 'already_available',
            evidence: 'Preprod HTTP OK; symptoms not found (login not verified in this engine)',
        };
    }
    return { verdict: 'broken_now', evidence: 'Could not complete a healthy authenticated check' };
}
function applyCaseStatuses(cases, verdict, loggedIn, evidence) {
    for (const tc of cases) {
        if (tc.source === 'login') {
            tc.status = loggedIn ? 'passed' : 'failed';
            tc.actual = loggedIn ? 'Logged into preprod' : evidence;
            continue;
        }
        if (verdict === 'broken_now') {
            tc.status = tc.source === 'ticket' || tc.source === 'image' || tc.source === 'video' ? 'failed' : 'passed';
            tc.actual = evidence;
        }
        else if (verdict === 'already_available') {
            tc.status = 'passed';
            tc.actual = evidence;
        }
        else {
            tc.status = 'blocked';
            tc.actual = evidence;
        }
    }
}
function formatBrokenTestComment(workItem, result) {
    const verdictLabel = result.verdict === 'broken_now'
        ? 'Broken now'
        : result.verdict === 'already_available'
            ? 'Already available'
            : 'Needs manual check';
    const failed = result.testCases.filter((t) => t.status === 'failed').map((t) => t.id);
    const passed = result.testCases.filter((t) => t.status === 'passed').map((t) => t.id);
    const imgHtml = result.screenshotUrls
        .map((url, i) => `<div><b>${escapeHtmlLite(result.screenshotNames[i] || `shot-${i + 1}`)}</b><br>` +
        `<img src="${url}" alt="RubiOps screenshot" style="max-width:720px" /></div>`)
        .join('<br>');
    return [
        `<b>RubiOps Broken Test</b>`,
        `#${workItem.id} — ${escapeHtmlLite(workItem.title)}`,
        `Verdict: <b>${verdictLabel}</b>`,
        `Logged in: ${result.loggedIn ? 'yes' : 'no'} · Engine: ${result.engine}`,
        `URL: ${escapeHtmlLite(result.prodUrl)}`,
        `Evidence: ${escapeHtmlLite(result.evidence)}`,
        failed.length ? `Failed: ${failed.join(', ')}` : '',
        passed.length ? `Passed: ${passed.join(', ')}` : '',
        result.screenshotNames.length
            ? `Screenshots attached (${result.screenshotNames.length}) — see below + work item Attachments.`
            : 'No screenshots (browser login required).',
        imgHtml,
        `<i>RubiOps</i>`,
    ]
        .filter(Boolean)
        .join('<br>');
}
function escapeHtmlLite(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function buildSymptoms(workItem) {
    const raw = `${workItem.title}\n${stripHtml(workItem.description)}`;
    const phrases = workItem.title
        .split(/[:\-–|]/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 6);
    const words = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 5)
        .slice(0, 30);
    return [...new Set([...phrases, ...words])].slice(0, 30);
}
function extractUrls(text) {
    const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
    return [...new Set(matches.map((u) => u.replace(/[),.;]+$/g, '')))];
}
function extractTitle(html) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 200) : undefined;
}
function stripHtml(value) {
    return value
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+\n/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}
function truncate(value, max) {
    return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
//# sourceMappingURL=brokenDeepTestService.js.map