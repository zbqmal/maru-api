import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { EnvironmentVariables } from '../../common/config/environment.variables';

export interface OpenAiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAiChatOptions {
  model?: string;
  messages: OpenAiChatMessage[];
  maxTokens?: number;
}

@Injectable()
export class OpenAiService {
  private readonly logger = new Logger(OpenAiService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly configService: ConfigService<EnvironmentVariables, true>,
  ) {
    const apiKey = this.configService.get('OPENAI_API_KEY', { infer: true });

    if (!apiKey) {
      this.logger.warn(
        'OPENAI_API_KEY is not set. OpenAI features will be disabled.',
      );
      this.client = null;
    } else {
      this.client = new OpenAI({ apiKey });
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async chat(options: OpenAiChatOptions): Promise<string> {
    if (!this.client) {
      throw new Error('OpenAI client is not configured. Set OPENAI_API_KEY.');
    }

    const response = await this.client.chat.completions.create({
      model: options.model ?? 'gpt-4o-mini',
      messages: options.messages,
      max_tokens: options.maxTokens ?? 200,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      throw new Error('OpenAI returned an empty response.');
    }

    return content.trim();
  }
}
