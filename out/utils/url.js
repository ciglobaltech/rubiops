"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeOrganizationUrl = normalizeOrganizationUrl;
exports.extractOrganizationName = extractOrganizationName;
exports.validateOrganizationUrl = validateOrganizationUrl;
function normalizeOrganizationUrl(url) {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (!trimmed.startsWith('https://')) {
        throw new Error('Organization URL must start with https://');
    }
    return trimmed;
}
function extractOrganizationName(url) {
    const normalized = normalizeOrganizationUrl(url);
    const devAzureMatch = normalized.match(/dev\.azure\.com\/([^/]+)/i);
    if (devAzureMatch) {
        return devAzureMatch[1];
    }
    const visualstudioMatch = normalized.match(/([^./]+)\.visualstudio\.com/i);
    if (visualstudioMatch) {
        return visualstudioMatch[1];
    }
    throw new Error('Invalid organization URL. Use https://dev.azure.com/your-org or https://your-org.visualstudio.com');
}
function validateOrganizationUrl(url) {
    try {
        extractOrganizationName(url);
        return null;
    }
    catch (error) {
        return error instanceof Error ? error.message : 'Invalid organization URL';
    }
}
//# sourceMappingURL=url.js.map