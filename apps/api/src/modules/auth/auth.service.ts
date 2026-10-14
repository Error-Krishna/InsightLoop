import { ObjectId } from 'mongodb';
import { getCollection } from '../../db/mongo.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { BadRequestError, UnauthorizedError } from '../../utils/errors.js';
import { generateTokens, verifyToken } from '../../utils/jwt.js';
import type { GoogleLoginInput, LoginInput, SignupInput } from '@insightloop/shared';

export class AuthService {
  static async login(input: LoginInput) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const email = input.email.trim().toLowerCase();
    const user = await usersCol.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    });

    if (!user || !user.password) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = verifyPassword(input.password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Update last login
    await usersCol.updateOne({ _id: user._id }, { $set: { last_login: new Date() } });

    // Fetch associated company
    let company = null;
    if (user.company) {
      const companyQuery = ObjectId.isValid(user.company)
        ? { _id: new ObjectId(user.company) }
        : { company_id: user.company };
      company = await companiesCol.findOne(companyQuery);
    }

    const companyId = company?.company_id || (user.company_id ? String(user.company_id) : '');
    const companyName = company?.name || 'My Company';

    const tokens = generateTokens(
      { _id: user._id, email: user.email, name: user.name || '' },
      companyId
    );

    return {
      tokens,
      user: {
        id: user._id.toString(),
        name: user.name || '',
        email: user.email,
        company_id: companyId,
        company_name: companyName,
      },
    };
  }

  static async signup(input: SignupInput) {
    const usersCol = getCollection('user');
    const companiesCol = getCollection('company');

    const email = input.email.trim().toLowerCase();
    const existing = await usersCol.findOne({
      email: { $regex: new RegExp(`^${email}$`, 'i') },
    });

    if (existing) {
      throw new BadRequestError('Email already registered.');
    }

    const companyName = (input.company || input.company_name || `${input.name}'s Company`).trim();
    const companyId = crypto.randomUUID();

    const companyDoc = {
      company_id: companyId,
      name: companyName,
      business_type: 'General',
      created_at: new Date(),
      workspace_settings: {
        realtime_dashboard_refresh: true,
        jwt_session_authentication: true,
        ai_assistant_enabled: true,
        inventory_workspace_mode: true,
      },
    };

    const compResult = await companiesCol.insertOne(companyDoc as any);
    const hashedPassword = hashPassword(input.password);

    const userDoc = {
      name: input.name.trim(),
      email,
      username: email.split('@')[0],
      password: hashedPassword,
      company: compResult.insertedId,
      subscription: 'Pro Plan (₹499/mo)',
      notifications: { comments: true, weekly_summary: true, updates: true },
      created_at: new Date(),
    };

    const userResult = await usersCol.insertOne(userDoc as any);

    const tokens = generateTokens(
      { _id: userResult.insertedId, email, name: input.name.trim() },
      companyId
    );

    return {
      tokens,
      user: {
        id: userResult.insertedId.toString(),
        name: input.name.trim(),
        email,
        company_id: companyId,
        company_name: companyName,
      },
    };
  }

  static async refresh(token: string) {
    const payload = verifyToken(token, 'refresh');
    const usersCol = getCollection('user');

    const user = await usersCol.findOne({ _id: new ObjectId(payload.user_id) });
    if (!user) {
      throw new UnauthorizedError('Token is invalid or expired', 'token_not_valid');
    }

    const { access } = generateTokens(
      { _id: user._id, email: user.email, name: user.name || '' },
      payload.company_id
    );

    return { access };
  }

  static async googleLogin(input: GoogleLoginInput) {
    const token = input.credential || input.id_token;
    if (!token) {
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }

    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      if (!response.ok) {
        throw new UnauthorizedError('Invalid or expired Google credential.');
      }
      const data = (await response.json()) as any;
      if (!data.email || (data.email_verified !== 'true' && data.email_verified !== true)) {
        throw new UnauthorizedError('Invalid or expired Google credential.');
      }

      // Find or create user
      const usersCol = getCollection('user');
      const companiesCol = getCollection('company');
      const email = data.email.toLowerCase();

      let user = await usersCol.findOne({ email });
      let company = null;

      if (!user) {
        const companyId = crypto.randomUUID();
        const compResult = await companiesCol.insertOne({
          company_id: companyId,
          name: `${data.name || 'User'}'s Company`,
          created_at: new Date(),
        } as any);

        const userResult = await usersCol.insertOne({
          name: data.name || email.split('@')[0],
          email,
          username: email.split('@')[0],
          company: compResult.insertedId,
          created_at: new Date(),
        } as any);

        user = await usersCol.findOne({ _id: userResult.insertedId });
        company = await companiesCol.findOne({ _id: compResult.insertedId });
      } else {
        company = await companiesCol.findOne({ _id: new ObjectId(user.company) });
      }

      const companyId = company?.company_id || '';
      const tokens = generateTokens(
        { _id: user!._id, email: user!.email, name: user!.name || '' },
        companyId
      );

      return {
        tokens,
        user: {
          id: user!._id.toString(),
          name: user!.name || '',
          email: user!.email,
          company_id: companyId,
          company_name: company?.name || '',
        },
      };
    } catch (err: any) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }
  }
}
