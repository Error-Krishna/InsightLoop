import { describe, expect, it } from 'vitest';
import { roundPy } from '@insightloop/shared';

describe('@insightloop/api smoke test', () => {
  it('imports shared package and executes successfully', () => {
    expect(roundPy(2.5)).toBe(2);
    expect(roundPy(3.5)).toBe(4);
  });
});
