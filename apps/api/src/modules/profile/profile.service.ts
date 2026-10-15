import { ProfileRepository } from './profile.repository.js';
import { NotFoundError } from '../../utils/errors.js';
import type { TenantScope } from '../../types/tenant.js';

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  location?: string;
  username?: string;
  company_name?: string;
  address?: string;
  gst_number?: string;
  bank_name?: string;
  ifsc_code?: string;
  bank_account_number?: string;
  branch_name?: string;
}

export interface UpdateSettingsInput {
  realtime_dashboard_refresh?: boolean;
  jwt_session_authentication?: boolean;
  ai_assistant_enabled?: boolean;
  inventory_workspace_mode?: boolean;
  comments?: boolean;
  weekly_summary?: boolean;
  updates?: boolean;
}

export class ProfileService {
  static async getProfile(userId: string, scope: TenantScope) {
    const user = await ProfileRepository.getUserById(userId);
    if (!user) throw new NotFoundError('User not found.');

    const company = await ProfileRepository.getCompany(scope);

    return {
      user: {
        name: user.name ?? '',
        email: user.email ?? '',
        phone: user.phone ?? null,
        location: user.location ?? null,
        username: user.username ?? user.email?.split('@')[0] ?? '',
        profile_pic: user.profile_pic ?? null,
      },
      company: company
        ? {
            company_id: company.company_id,
            name: company.name ?? '',
            address: company.address ?? null,
            email: company.email ?? null,
            phone: company.phone ?? null,
            gst_number: company.gst_number ?? null,
            logo_url: company.logo_url ?? null,
            stamp_url: company.stamp_url ?? null,
            signature_url: company.signature_url ?? null,
            bank_account_number: company.bank_account_number ?? null,
            ifsc_code: company.ifsc_code ?? null,
            bank_name: company.bank_name ?? null,
            branch_name: company.branch_name ?? null,
          }
        : null,
    };
  }

  static async updateProfile(userId: string, scope: TenantScope, data: UpdateProfileInput) {
    const userUpdate: Record<string, unknown> = {};
    if (data.name !== undefined) userUpdate.name = data.name;
    if (data.phone !== undefined) userUpdate.phone = data.phone;
    if (data.location !== undefined) userUpdate.location = data.location;
    if (data.username !== undefined) userUpdate.username = data.username;

    if (Object.keys(userUpdate).length > 0) {
      await ProfileRepository.updateUser(userId, userUpdate);
    }

    const companyUpdate: Record<string, unknown> = {};
    if (data.company_name !== undefined) companyUpdate.name = data.company_name;
    if (data.address !== undefined) companyUpdate.address = data.address;
    if (data.gst_number !== undefined) companyUpdate.gst_number = data.gst_number;
    if (data.bank_name !== undefined) companyUpdate.bank_name = data.bank_name;
    if (data.ifsc_code !== undefined) companyUpdate.ifsc_code = data.ifsc_code;
    if (data.bank_account_number !== undefined) companyUpdate.bank_account_number = data.bank_account_number;
    if (data.branch_name !== undefined) companyUpdate.branch_name = data.branch_name;

    if (Object.keys(companyUpdate).length > 0) {
      await ProfileRepository.updateCompany(scope, companyUpdate);
    }

    return this.getProfile(userId, scope);
  }

  static async getSettings(userId: string, scope: TenantScope) {
    const user = await ProfileRepository.getUserById(userId);
    const company = await ProfileRepository.getCompany(scope);

    return {
      workspace_settings: company?.workspace_settings ?? {
        realtime_dashboard_refresh: true,
        jwt_session_authentication: true,
        ai_assistant_enabled: true,
        inventory_workspace_mode: true,
      },
      notifications: user?.notifications ?? {
        comments: true,
        weekly_summary: true,
        updates: true,
      },
    };
  }

  static async updateSettings(userId: string, scope: TenantScope, data: UpdateSettingsInput) {
    const currentSettings = await this.getSettings(userId, scope);

    const newWorkspaceSettings = {
      ...currentSettings.workspace_settings,
      ...(data.realtime_dashboard_refresh !== undefined && { realtime_dashboard_refresh: Boolean(data.realtime_dashboard_refresh) }),
      ...(data.jwt_session_authentication !== undefined && { jwt_session_authentication: Boolean(data.jwt_session_authentication) }),
      ...(data.ai_assistant_enabled !== undefined && { ai_assistant_enabled: Boolean(data.ai_assistant_enabled) }),
      ...(data.inventory_workspace_mode !== undefined && { inventory_workspace_mode: Boolean(data.inventory_workspace_mode) }),
    };

    const newNotifications = {
      ...currentSettings.notifications,
      ...(data.comments !== undefined && { comments: Boolean(data.comments) }),
      ...(data.weekly_summary !== undefined && { weekly_summary: Boolean(data.weekly_summary) }),
      ...(data.updates !== undefined && { updates: Boolean(data.updates) }),
    };

    await ProfileRepository.updateCompany(scope, {
      workspace_settings: newWorkspaceSettings,
    });

    await ProfileRepository.updateUser(userId, {
      notifications: newNotifications,
    });

    return {
      workspace_settings: newWorkspaceSettings,
      notifications: newNotifications,
    };
  }
}
