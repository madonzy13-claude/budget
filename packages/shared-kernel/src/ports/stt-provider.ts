export interface STTProvider {
  transcribe(args: {
    audio: Uint8Array;
    language: 'en' | 'pl' | 'uk';
  }): Promise<{ text: string }>;
}

export class InMemorySTTProvider implements STTProvider {
  constructor(private readonly opts: { canned: string }) {}

  async transcribe(_args: {
    audio: Uint8Array;
    language: 'en' | 'pl' | 'uk';
  }): Promise<{ text: string }> {
    return { text: this.opts.canned };
  }
}
