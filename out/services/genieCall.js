"use strict";
/**
 * "/genie" is the call any installed agent can start with.
 * The text after it is the prompt. "/genie" alone opens the guide.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.splitGenieCall = splitGenieCall;
exports.promptFromAgentCall = promptFromAgentCall;
const GENIE_PREFIX = /^\/genie\b[:\s-]*([\s\S]*)$/i;
const GUIDE_WORD = /^(help|guide|how(?:\s+to)?(?:\s+use)?)$/i;
function splitGenieCall(text) {
    const match = text.trim().match(GENIE_PREFIX);
    if (!match) {
        return undefined;
    }
    return classify(match[1] ?? '');
}
/** A chat @genie request, with or without a /genie prefix in the prompt. */
function promptFromAgentCall(prompt, command) {
    if (command === 'guide') {
        return { guideOnly: true, prompt: '' };
    }
    const trimmed = prompt.trim();
    const prefixed = splitGenieCall(command === 'genie' ? `/genie ${trimmed}` : trimmed);
    if (prefixed) {
        return prefixed;
    }
    return classify(trimmed);
}
function classify(text) {
    const prompt = text.trim();
    if (!prompt || GUIDE_WORD.test(prompt)) {
        return { guideOnly: true, prompt: '' };
    }
    return { guideOnly: false, prompt };
}
//# sourceMappingURL=genieCall.js.map