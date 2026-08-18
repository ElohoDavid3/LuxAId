import { env } from '../../../lib/env';
import { OpenAIProvider } from './openai';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMResponse {
  content: string | null;
  tool_calls: LLMToolCall[];
  finish_reason: string;
}

export interface LLMProvider {
  chat(params: {
    system: string;
    messages: LLMMessage[];
    tools: LLMTool[];
  }): Promise<LLMResponse>;
}

export function createLLMProvider(): LLMProvider {
  const apiKey = env.OPENAI_API_KEY;
  const model = env.AI_MODEL;

  if (!apiKey || !model) {
    throw new Error(
      'OPENAI_API_KEY and AI_MODEL environment variables are required for the AI agent.',
    );
  }

  return new OpenAIProvider(apiKey, model);
}
