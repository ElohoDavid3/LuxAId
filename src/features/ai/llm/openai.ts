import OpenAI from 'openai';
import type {
  LLMMessage,
  LLMProvider,
  LLMResponse,
  LLMTool,
  LLMToolCall,
} from './provider';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async chat(params: {
    system: string;
    messages: LLMMessage[];
    tools: LLMTool[];
  }): Promise<LLMResponse> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: params.system },
      ...params.messages.map((m) => this.mapMessage(m)),
    ];

    const tools =
      params.tools.length > 0
        ? params.tools.map((t) => ({
            type: 'function' as const,
            function: {
              name: t.name,
              description: t.description,
              parameters: t.parameters,
            },
          }))
        : undefined;

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      tools,
    });

    const choice = response.choices[0];
    if (!choice) {
      return { content: null, tool_calls: [], finish_reason: 'stop' };
    }

    const toolCalls: LLMToolCall[] = (choice.message.tool_calls ?? []).map(
      (tc) => {
        const fn = 'function' in tc ? tc.function : undefined;
        return {
          id: tc.id,
          name: fn?.name ?? '',
          arguments: fn?.arguments ?? '{}',
        };
      },
    );

    return {
      content: choice.message.content ?? null,
      tool_calls: toolCalls,
      finish_reason: choice.finish_reason ?? 'stop',
    };
  }

  private mapMessage(
    msg: LLMMessage,
  ): OpenAI.ChatCompletionMessageParam {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content,
        tool_call_id: msg.tool_call_id!,
      };
    }

    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: 'assistant',
        content: msg.content,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        })),
      };
    }

    return {
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    };
  }
}
