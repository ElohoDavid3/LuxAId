import { ConversationControlState } from '@prisma/client';
import { logAudit } from '../auth/audit';
import * as conversationService from '../conversations/conversation.service';
import * as messageService from '../messages/message.service';
import { resolveSystemUser } from './system-user';
import { createLLMProvider, type LLMMessage } from './llm/provider';
import { buildSystemPrompt } from './prompts/system';
import { TOOL_DEFINITIONS } from './tools/definitions';
import { executeTool, type ToolHandlerContext } from './tools/handlers';

const MAX_TOOL_ITERATIONS = 5;

export interface AgentResult {
  reply: string;
  actions: Array<{ tool: string; result: string }>;
}

export async function handleIncomingMessage(params: {
  businessId: string;
  conversationId: string;
  customerId: string;
  messageBody: string;
}): Promise<AgentResult> {
  const { businessId, conversationId, customerId, messageBody } = params;

  const systemUser = await resolveSystemUser(businessId);

  const conversation = await conversationService.getConversation(
    systemUser.userId,
    businessId,
    conversationId,
  );

  if (conversation.controlState !== ConversationControlState.AI_CONTROLLED) {
    return { reply: '', actions: [] };
  }

  await logAudit({
    businessId,
    eventType: 'AI_MESSAGE_RECEIVED',
    actorType: 'AI',
    actorId: systemUser.userId,
    payload: {
      conversationId,
      customerId,
      messageLength: messageBody.length,
    },
  });

  const provider = createLLMProvider();
  const systemPrompt = await buildSystemPrompt(businessId);

  const historyResult = await messageService.getMessages(
    systemUser.userId,
    businessId,
    conversationId,
    { limit: 20 },
  );

  const historyMessages: LLMMessage[] = historyResult.items.map((m) => ({
    role: m.authorType === 'CUSTOMER' ? 'user' : 'assistant',
    content:
      m.authorType === 'HUMAN'
        ? `[Human agent]: ${m.body}`
        : m.body,
  }));

  const messages: LLMMessage[] = [
    ...historyMessages,
    { role: 'user', content: messageBody },
  ];

  const toolCtx: ToolHandlerContext = {
    systemUserId: systemUser.userId,
    businessId,
    conversationId,
    customerId,
  };

  const actions: Array<{ tool: string; result: string }> = [];
  let finalContent: string | null = null;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await provider.chat({
      system: systemPrompt,
      messages,
      tools: TOOL_DEFINITIONS,
    });

    if (response.tool_calls.length > 0) {
      messages.push({
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.tool_calls,
      });

      for (const toolCall of response.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.arguments);
        } catch {
          // invalid JSON from LLM
        }

        const result = await executeTool(toolCall.name, args, toolCtx);
        actions.push({ tool: toolCall.name, result });

        await logAudit({
          businessId,
          eventType: 'AI_TOOL_EXECUTED',
          actorType: 'AI',
          actorId: systemUser.userId,
          payload: {
            conversationId,
            toolName: toolCall.name,
            success: !result.startsWith('{"error":true'),
          },
        });

        messages.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        });
      }

      continue;
    }

    finalContent = response.content;
    break;
  }

  if (finalContent === null) {
    finalContent =
      "I'm having trouble completing this request. Let me connect you with a human.";

    const escalationResult = await executeTool(
      'escalate_to_human',
      { conversationId, reason: 'AI max iterations exceeded' },
      toolCtx,
    );
    actions.push({ tool: 'escalate_to_human', result: escalationResult });
  }

  await messageService.createMessage(systemUser.userId, businessId, conversationId, {
    authorType: 'AI',
    channel: 'internal',
    body: finalContent,
  });

  await logAudit({
    businessId,
    eventType: 'AI_REPLY_SENT',
    actorType: 'AI',
    actorId: systemUser.userId,
    payload: {
      conversationId,
      replyLength: finalContent.length,
      toolCallsCount: actions.length,
    },
  });

  return { reply: finalContent, actions };
}
