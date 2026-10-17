import { z } from 'zod';

export const WorkspaceSettingsSchema = z.object({
  realtime_dashboard_refresh: z.boolean().optional(),
  jwt_session_authentication: z.boolean().optional(),
  ai_assistant_enabled: z.boolean().optional(),
  inventory_workspace_mode: z.boolean().optional(),
  comments: z.boolean().optional(),
  weekly_summary: z.boolean().optional(),
  updates: z.boolean().optional(),
});

export type WorkspaceSettingsInput = z.infer<typeof WorkspaceSettingsSchema>;

export const ProfileUpdateSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  username: z.string().optional(),
  company_name: z.string().optional(),
  address: z.string().optional(),
  gst_number: z.string().optional(),
  bank_name: z.string().optional(),
  ifsc_code: z.string().optional(),
  bank_account_number: z.string().optional(),
  branch_name: z.string().optional(),
});

export type ProfileUpdateInput = z.infer<typeof ProfileUpdateSchema>;
