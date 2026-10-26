"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertDescriptionBlock = upsertDescriptionBlock;
exports.hasDescriptionBlock = hasDescriptionBlock;
exports._clearBlocksForTest = _clearBlocksForTest;
const BLOCK_PATTERN = /(?:<p>)?---\s*(?:RubiOps|DEVOPS\s*NEXA(?:\s*AI)?|SmartGenie)\s+(.+?)\s*\(auto\)\s*---[\s\S]*?---\s*end\s+(?:RubiOps|DEVOPS\s*NEXA(?:\s*AI)?|SmartGenie)\s+\1\s*---(?:<\/p>)?/gi;
function upsertDescriptionBlock(currentHtmlOrText, blockName, bodyPlain) {
    const fence = `--- RubiOps ${blockName} (auto) ---`;
    const end = `--- end RubiOps ${blockName} ---`;
    const bodyHtml = bodyPlain
        .trim()
        .split('\n')
        .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
        .join('<br>');
    const block = `${fence}<br>${bodyHtml}<br>${end}`;
    const escapedName = blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:<p>)?---\\s*(?:RubiOps|DEVOPS\\s*NEXA(?:\\s*AI)?|SmartGenie)\\s+${escapedName}\\s*\\(auto\\)\\s*---[\\s\\S]*?---\\s*end\\s+(?:RubiOps|DEVOPS\\s*NEXA(?:\\s*AI)?|SmartGenie)\\s+${escapedName}\\s*---(?:</p>)?`, 'i');
    const base = currentHtmlOrText?.trim() ?? '';
    if (pattern.test(base)) {
        return base.replace(pattern, block);
    }
    if (!base) {
        return block;
    }
    return `${stripTrailingNoise(base)}<br><br>${block}`;
}
function hasDescriptionBlock(currentHtmlOrText, blockName) {
    const escapedName = blockName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`---\\s*(?:RubiOps|DEVOPS\\s*NEXA(?:\\s*AI)?|SmartGenie)\\s+${escapedName}\\s*\\(auto\\)\\s*---`, 'i');
    return pattern.test(currentHtmlOrText ?? '');
}
function stripTrailingNoise(value) {
    return value.replace(/\s+$/u, '');
}
/** @internal exposed for tests */
function _clearBlocksForTest(text) {
    return text.replace(BLOCK_PATTERN, '').trim();
}
//# sourceMappingURL=descriptionBlocks.js.map