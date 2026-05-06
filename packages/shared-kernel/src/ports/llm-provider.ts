import type { UserId } from '../ids';

export interface LLMProvider {
  generateObject<T>(args: {
    schema: unknown;
    prompt: string;
    userId: UserId;
  }): Promise<T>;
}

export class InMemoryLLMProvider implements LLMProvider {
  constructor(private readonly opts: { canned: unknown }) {}

  async generateObject<T>(_args: {
    schema: unknown;
    prompt: string;
    userId: UserId;
  }): Promise<T> {
    return this.opts.canned as T;
  }
}
