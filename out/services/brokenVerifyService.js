"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokenVerifyService = void 0;
const axios_1 = __importDefault(require("axios"));
class BrokenVerifyService {
    async verify(workItem, prodUrl) {
        const checkedAt = new Date().toISOString();
        const symptoms = buildSymptoms(workItem);
        try {
            const playwrightResult = await tryPlaywright(prodUrl, symptoms);
            if (playwrightResult) {
                return toResult(playwrightResult, prodUrl, checkedAt, 'playwright');
            }
        }
        catch {
            // fall through to HTTP
        }
        const httpResult = await verifyWithHttp(prodUrl, symptoms);
        return toResult(httpResult, prodUrl, checkedAt, 'http');
    }
}
exports.BrokenVerifyService = BrokenVerifyService;
async function tryPlaywright(prodUrl, symptoms) {
    let chromium;
    try {
        // Optional dependency — may be missing in packaged VSIX.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        ({ chromium } = require('playwright'));
    }
    catch {
        return undefined;
    }
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const response = await page.goto(prodUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        const httpStatus = response?.status();
        const pageTitle = await page.title();
        const bodyText = ((await page.locator('body').innerText().catch(() => '')) || '').slice(0, 8000);
        const consoleErrors = [];
        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text());
            }
        });
        await page.waitForTimeout(1500);
        return scorePage({
            httpStatus,
            pageTitle,
            bodyText,
            consoleErrors,
            symptoms,
        });
    }
    finally {
        await browser.close();
    }
}
async function verifyWithHttp(prodUrl, symptoms) {
    try {
        const response = await axios_1.default.get(prodUrl, {
            timeout: 30_000,
            maxRedirects: 5,
            validateStatus: () => true,
            headers: {
                'User-Agent': 'RubiOps-BrokenVerify/1.0',
                Accept: 'text/html,application/xhtml+xml',
            },
            responseType: 'text',
            transformResponse: [(data) => data],
        });
        const html = typeof response.data === 'string' ? response.data : String(response.data ?? '');
        const pageTitle = extractTitle(html);
        const bodyText = stripHtml(html).slice(0, 8000);
        return scorePage({
            httpStatus: response.status,
            pageTitle,
            bodyText,
            consoleErrors: [],
            symptoms,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            verdict: 'broken_now',
            evidence: `Request failed: ${message}`,
        };
    }
}
function scorePage(input) {
    const { httpStatus, pageTitle, bodyText, consoleErrors, symptoms } = input;
    const lower = `${pageTitle ?? ''}\n${bodyText}`.toLowerCase();
    if (httpStatus !== undefined && httpStatus >= 500) {
        return {
            verdict: 'broken_now',
            httpStatus,
            pageTitle,
            evidence: `HTTP ${httpStatus} from prod — server error`,
        };
    }
    if (httpStatus !== undefined && httpStatus >= 400) {
        return {
            verdict: 'broken_now',
            httpStatus,
            pageTitle,
            evidence: `HTTP ${httpStatus} from prod — page not reachable as expected`,
        };
    }
    const loginWall = /\b(sign in|log in|login|authenticate|sso)\b/i.test(lower) &&
        bodyText.trim().length < 400;
    if (loginWall) {
        return {
            verdict: 'needs_manual_check',
            httpStatus,
            pageTitle,
            evidence: 'Possible login wall — automated check cannot confirm',
        };
    }
    const errorShell = /\b(something went wrong|unexpected error|application error|stack trace|not found)\b/i.test(lower);
    if (errorShell || consoleErrors.length > 2) {
        return {
            verdict: 'broken_now',
            httpStatus,
            pageTitle,
            evidence: errorShell
                ? 'Error wording detected on page'
                : `Console errors: ${consoleErrors.slice(0, 3).join(' | ')}`,
        };
    }
    const matched = symptoms.filter((s) => s.length >= 4 && lower.includes(s.toLowerCase()));
    if (matched.length >= 2) {
        return {
            verdict: 'broken_now',
            httpStatus,
            pageTitle,
            evidence: `Bug symptoms still visible on page: ${matched.slice(0, 4).join(', ')}`,
        };
    }
    if (matched.length === 1 && bodyText.length > 200) {
        return {
            verdict: 'needs_manual_check',
            httpStatus,
            pageTitle,
            evidence: `Partial symptom match ("${matched[0]}") — confirm manually`,
        };
    }
    if (httpStatus !== undefined && httpStatus >= 200 && httpStatus < 400 && bodyText.length > 80) {
        return {
            verdict: 'already_available',
            httpStatus,
            pageTitle,
            evidence: 'Prod page loaded successfully; reported symptoms not found in page text',
        };
    }
    return {
        verdict: 'needs_manual_check',
        httpStatus,
        pageTitle,
        evidence: 'Insufficient page signal for a confident verdict',
    };
}
function toResult(outcome, prodUrl, checkedAt, engine) {
    const label = outcome.verdict === 'broken_now'
        ? 'Broken now'
        : outcome.verdict === 'already_available'
            ? 'Already available'
            : 'Needs manual check';
    const plainText = [
        `Verdict: ${label}`,
        `Prod URL: ${prodUrl}`,
        `Checked at: ${checkedAt}`,
        `Engine: ${engine}`,
        outcome.httpStatus !== undefined ? `HTTP: ${outcome.httpStatus}` : undefined,
        outcome.pageTitle ? `Title: ${outcome.pageTitle}` : undefined,
        `Evidence: ${outcome.evidence}`,
    ]
        .filter(Boolean)
        .join('\n');
    return {
        verdict: outcome.verdict,
        prodUrl,
        checkedAt,
        httpStatus: outcome.httpStatus,
        pageTitle: outcome.pageTitle,
        evidence: outcome.evidence,
        engine,
        plainText,
    };
}
function buildSymptoms(workItem) {
    const raw = `${workItem.title}\n${stripHtml(workItem.description)}\n${stripHtml(workItem.acceptanceCriteria ?? '')}`;
    const words = raw
        .toLowerCase()
        .replace(/[^a-z0-9\s\-_/]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 5)
        .slice(0, 40);
    const phrases = stripHtml(workItem.title)
        .split(/[:\-–|]/)
        .map((p) => p.trim())
        .filter((p) => p.length >= 6)
        .slice(0, 5);
    return [...new Set([...phrases, ...words])].slice(0, 30);
}
function extractTitle(html) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return match ? stripHtml(match[1]).slice(0, 200) : undefined;
}
function stripHtml(value) {
    return value
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=brokenVerifyService.js.map