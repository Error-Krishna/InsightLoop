import { z } from 'zod';

export const AICommandSchema = z.object({
  command: z.string().min(1, 'Command string is required.'),
  assistant: z.string().optional().default('insightloop'),
});

export type AICommandInput = z.infer<typeof AICommandSchema>;
