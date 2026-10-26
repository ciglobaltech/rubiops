/**
 * Lets Copilot chat and other VS Code agents hand a prompt to RubiOps
 * by starting with /genie or by calling @genie.
 */

import * as vscode from 'vscode';
import { AgentChatPanel } from '../views/agentChatPanel';
import { COMMANDS } from '../utils/constants';
import { promptFromAgentCall, splitGenieCall } from './genieCall';

const PARTICIPANT_ID = 'rubiops.genie';
const TOOL_NAME = 'rubiops_genie';

export function registerGenieEntry(
  context: vscode.ExtensionContext,
  agent: AgentChatPanel,
  output: vscode.OutputChannel
): void {
  try {
    if (vscode.chat?.createChatParticipant) {
      const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (request, _chatContext, stream, token) => {
        if (token.isCancellationRequested) {
          return;
        }
        const call = promptFromAgentCall(request.prompt, request.command);
        if (call.guideOnly) {
          await vscode.commands.executeCommand(COMMANDS.OPEN_GUIDE);
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
  } catch (error) {
    output.appendLine(`Chat participant was not registered: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (vscode.lm?.registerTool) {
      context.subscriptions.push(
        vscode.lm.registerTool<{ prompt?: string }>(TOOL_NAME, {
          prepareInvocation(options) {
            const prompt = options.input.prompt?.trim() || '/genie';
            return { invocationMessage: `RubiOps · ${prompt}` };
          },
          async invoke(options, token) {
            if (token.isCancellationRequested) {
              return textResult('Cancelled.');
            }
            const raw = options.input.prompt?.trim() ?? '';
            const call = splitGenieCall(raw) ?? promptFromAgentCall(raw);
            if (call.guideOnly) {
              await vscode.commands.executeCommand(COMMANDS.OPEN_GUIDE);
              return textResult('The RubiOps guide is open. Send the prompt after /genie.');
            }
            const reply = await agent.submit(call.prompt);
            return textResult(reply || 'RubiOps finished with an empty reply.');
          },
        })
      );
      output.appendLine('Tool rubiops_genie is ready for prompts that start with /genie.');
    }
  } catch (error) {
    output.appendLine(`Genie tool was not registered: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function textResult(value: string): vscode.LanguageModelToolResult {
  return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(value)]);
}
