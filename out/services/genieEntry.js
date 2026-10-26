"use strict";
/**
 * Lets Copilot chat and other VS Code agents hand a prompt to RubiOps
 * by starting with /genie or by calling @genie.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerGenieEntry = registerGenieEntry;
const vscode = __importStar(require("vscode"));
const constants_1 = require("../utils/constants");
const genieCall_1 = require("./genieCall");
const PARTICIPANT_ID = 'rubiops.genie';
const TOOL_NAME = 'rubiops_genie';
function registerGenieEntry(context, agent, output) {
    try {
        if (vscode.chat?.createChatParticipant) {
            const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, _chatContext, stream, token) => {
                if (token.isCancellationRequested) {
                    return;
                }
                const call = (0, genieCall_1.promptFromAgentCall)(request.prompt, request.command);
                if (call.guideOnly) {
                    await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_GUIDE);
                    stream.markdown('The RubiOps guide is open. Add your prompt after `/genie`, for example `/genie run web app`.');
                    return;
                }
                stream.progress('RubiOps is guiding this prompt…');
                const reply = await agent.submit(call.prompt);
                if (!token.isCancellationRequested) {
                    stream.markdown(reply || 'RubiOps finished with an empty reply.');
                }
            });
            context.subscriptions.push(participant);
            output.appendLine('Chat participant @genie is ready. A prompt can start with /genie.');
        }
    }
    catch (error) {
        output.appendLine(`Chat participant was not registered: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
        if (vscode.lm?.registerTool) {
            context.subscriptions.push(vscode.lm.registerTool(TOOL_NAME, {
                prepareInvocation(options) {
                    const prompt = options.input.prompt?.trim() || '/genie';
                    return { invocationMessage: `RubiOps · ${prompt}` };
                },
                async invoke(options, token) {
                    if (token.isCancellationRequested) {
                        return textResult('Cancelled.');
                    }
                    const raw = options.input.prompt?.trim() ?? '';
                    const call = (0, genieCall_1.splitGenieCall)(raw) ?? (0, genieCall_1.promptFromAgentCall)(raw);
                    if (call.guideOnly) {
                        await vscode.commands.executeCommand(constants_1.COMMANDS.OPEN_GUIDE);
                        return textResult('The RubiOps guide is open. Send the prompt after /genie.');
                    }
                    const reply = await agent.submit(call.prompt);
                    return textResult(reply || 'RubiOps finished with an empty reply.');
                },
            }));
            output.appendLine('Tool rubiops_genie is ready for prompts that start with /genie.');
        }
    }
    catch (error) {
        output.appendLine(`Genie tool was not registered: ${error instanceof Error ? error.message : String(error)}`);
    }
}
function textResult(value) {
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}
//# sourceMappingURL=genieEntry.js.map