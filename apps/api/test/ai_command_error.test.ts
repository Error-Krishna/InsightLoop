import { describe, it, expect, vi } from 'vitest';
import { AiService } from '../src/modules/ai/ai.service.js';
import { AiRepository } from '../src/modules/ai/ai.repository.js';
import type { TenantScope } from '../src/types/tenant.js';

describe('A6: AI Command Error Sanitization', () => {
  it('does not leak internal database errors or connection details to the client', async () => {
    // Mock AiRepository.aggregateBusinessData to throw internal DB error
    vi.spyOn(AiRepository, 'aggregateBusinessData').mockRejectedValueOnce(
      new Error('MongoNetworkTimeoutError: connection to internal-db.cluster-123.mongodb.net:27017 failed with password=supersecret')
    );

    const scope: TenantScope = { companyId: 'test-company-123' };
    const result = await AiService.processAiCommand(scope, 'test@example.com', 'show revenue trends', 'jarvis');

    expect(result.action).toBe('error');
    expect(result.content).toBe('Error processing your request: An unexpected error occurred while processing your request.');
    expect(result.content).not.toContain('MongoNetworkTimeoutError');
    expect(result.content).not.toContain('supersecret');
    expect(result.content).not.toContain('mongodb.net');
  });
});
