// Placeholder test — ensures bun test exits 0 on empty skeleton.
// Remove when real domain tests are added.
import { describe, it, expect } from 'bun:test';

describe('shared-kernel scaffold', () => {
  it('skeleton is present', () => {
    expect(true).toBe(true);
  });
});
