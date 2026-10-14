import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import { NotFoundError } from '../../utils/errors.js';

export class ProfileService {
  static async getProfile(userId: string, companyId: string) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const user = await usersCol.findOne({ _id: new ObjectId(userId) });
    if (!user) throw new NotFoundError('User not found.');

    const company = await companiesCol.findOne({ company_id: companyId });

    return {
      user: {
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || null,
        location: user.location || null,
        username: user.username || user.email?.split('@')[0] || '',
        profile_pic: user.profile_pic || null,
      },
      company: company
        ? {
            company_id: company.company_id,
            name: company.name || '',
            address: company.address || null,
            email: company.email || null,
            phone: company.phone || null,
            gst_number: company.gst_number || null,
            logo_url: company.logo_url || null,
            stamp_url: company.stamp_url || null,
            signature_url: company.signature_url || null,
            bank_account_number: company.bank_account_number || null,
            ifsc_code: company.ifsc_code || null,
            bank_name: company.bank_name || null,
            branch_name: company.branch_name || null,
          }
        : null,
    };
  }

  static async updateProfile(userId: string, companyId: string, data: any) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const userUpdate: Record<string, any> = {};
    if (data.name !== undefined) userUpdate.name = data.name;
    if (data.phone !== undefined) userUpdate.phone = data.phone;
    if (data.location !== undefined) userUpdate.location = data.location;
    if (data.username !== undefined) userUpdate.username = data.username;

    if (Object.keys(userUpdate).length > 0) {
      await usersCol.updateOne({ _id: new ObjectId(userId) }, { $set: userUpdate });
    }

    const companyUpdate: Record<string, any> = {};
    if (data.company_name !== undefined) companyUpdate.name = data.company_name;
    if (data.address !== undefined) companyUpdate.address = data.address;
    if (data.gst_number !== undefined) companyUpdate.gst_number = data.gst_number;
    if (data.bank_name !== undefined) companyUpdate.bank_name = data.bank_name;
    if (data.ifsc_code !== undefined) companyUpdate.ifsc_code = data.ifsc_code;
    if (data.bank_account_number !== undefined) companyUpdate.bank_account_number = data.bank_account_number;
    if (data.branch_name !== undefined) companyUpdate.branch_name = data.branch_name;

    if (Object.keys(companyUpdate).length > 0) {
      await companiesCol.updateOne({ company_id: companyId }, { $set: companyUpdate });
    }

    return this.getProfile(userId, companyId);
  }

  static async getSettings(userId: string, companyId: string) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const user = await usersCol.findOne({ _id: new ObjectId(userId) });
    const company = await companiesCol.findOne({ company_id: companyId });

    return {
      workspace_settings: company?.workspace_settings || {
        realtime_dashboard_refresh: true,
        jwt_session_authentication: true,
        ai_assistant_enabled: true,
        inventory_workspace_mode: true,
      },
      notifications: user?.notifications || {
        comments: true,
        weekly_summary: true,
        updates: true,
      },
    };
  }

  static async updateSettings(userId: string, companyId: string, data: any) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const currentSettings = await this.getSettings(userId, companyId);

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

    await companiesCol.updateOne(
      { company_id: companyId },
      { $set: { workspace_settings: newWorkspaceSettings } }
    );

    await usersCol.updateOne(
      { _id: new ObjectId(userId) },
      { $set: { notifications: newNotifications } }
    );

    return {
      workspace_settings: newWorkspaceSettings,
      notifications: newNotifications,
    };
  }
}
