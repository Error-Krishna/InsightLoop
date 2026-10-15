import { ObjectId } from 'mongodb';
import { AuthRepository } from './auth.repository.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { BadRequestError, UnauthorizedError } from '../../utils/errors.js';
import { generateTokens, verifyToken } from '../../utils/jwt.js';
import type { GoogleLoginInput, LoginInput, SignupInput } from '@insightloop/shared';
import crypto from 'node:crypto';

export class AuthService {
  static async login(input: LoginInput) {
    const user = await AuthRepository.findUserByEmail(input.email);

    if (!user?.password) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isValid = verifyPassword(input.password, user.password);
    if (!isValid) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    // Update last login
    await AuthRepository.updateLastLogin(user._id);

    // Fetch associated company
    let company = null;
    if (user.company) {
      const companyQuery = ObjectId.isValid(user.company)
        ? { _id: new ObjectId(user.company) }
        : { company_id: String(user.company) };
      company = await AuthRepository.findCompany(companyQuery);
    }

    const companyId = company?.company_id ?? (user.company_id ? String(user.company_id) : '');
    const companyName = company?.name ?? 'My Company';

    const tokens = generateTokens(
      { _id: user._id, email: user.email, name: user.name ?? '' },
      companyId
    );

    return {
      tokens,
      user: {
        id: user._id.toString(),
        name: user.name ?? '',
        email: user.email,
        company_id: companyId,
        company_name: companyName,
      },
    };
  }

  static async signup(input: SignupInput) {
    const existing = await AuthRepository.findUserByEmail(input.email);
    if (existing) {
      throw new BadRequestError('Email already registered.');
    }

    const email = input.email.trim().toLowerCase();
    const companyName = (input.company ?? input.company_name ?? `${input.name}'s Company`).trim();
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

    const compId = await AuthRepository.createCompany(companyDoc);
    const hashedPassword = hashPassword(input.password);

    const userDoc = {
      name: input.name.trim(),
      email,
      username: email.split('@')[0],
      password: hashedPassword,
      company: compId,
      subscription: 'Pro Plan (₹499/mo)',
      notifications: { comments: true, weekly_summary: true, updates: true },
      created_at: new Date(),
    };

    const userId = await AuthRepository.createUser(userDoc);

    const tokens = generateTokens(
      { _id: userId, email, name: input.name.trim() },
      companyId
    );

    return {
      tokens,
      user: {
        id: userId.toString(),
        name: input.name.trim(),
        email,
        company_id: companyId,
        company_name: companyName,
      },
    };
  }

  static async refresh(token: string) {
    const payload = verifyToken(token, 'refresh');
    const user = await AuthRepository.findUserById(payload.user_id);
    if (!user) {
      throw new UnauthorizedError('Token is invalid or expired', 'token_not_valid');
    }

    const { access } = generateTokens(
      { _id: user._id, email: user.email, name: user.name ?? '' },
      payload.company_id
    );

    return { access };
  }

  static async googleLogin(input: GoogleLoginInput) {
    const token = input.credential ?? input.id_token;
    if (!token) {
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }

    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${token}`);
      if (!response.ok) {
        throw new UnauthorizedError('Invalid or expired Google credential.');
      }
      const data = (await response.json()) as { email?: string; email_verified?: string | boolean; name?: string };
      if (!data.email || (data.email_verified !== 'true' && data.email_verified !== true)) {
        throw new UnauthorizedError('Invalid or expired Google credential.');
      }

      const email = data.email.toLowerCase();
      let user = await AuthRepository.findUserByEmail(email);
      let company = null;

      if (!user) {
        const companyId = crypto.randomUUID();
        const compId = await AuthRepository.createCompany({
          company_id: companyId,
          name: `${data.name ?? 'User'}'s Company`,
          created_at: new Date(),
        });

        const userId = await AuthRepository.createUser({
          name: data.name ?? email.split('@')[0],
          email,
          username: email.split('@')[0],
          company: compId,
          created_at: new Date(),
        });

        user = await AuthRepository.findUserById(userId);
        company = await AuthRepository.findCompany({ _id: compId });
      } else if (user.company) {
        const companyQuery = ObjectId.isValid(user.company)
          ? { _id: new ObjectId(user.company) }
          : { company_id: String(user.company) };
        company = await AuthRepository.findCompany(companyQuery);
      }

      if (!user) {
        throw new UnauthorizedError('Invalid or expired Google credential.');
      }

      const companyId = company?.company_id ?? '';
      const tokens = generateTokens(
        { _id: user._id, email: user.email, name: user.name ?? '' },
        companyId
      );

      return {
        tokens,
        user: {
          id: user._id.toString(),
          name: user.name ?? '',
          email: user.email,
          company_id: companyId,
          company_name: company?.name ?? '',
        },
      };
    } catch (err: unknown) {
      if (err instanceof UnauthorizedError) throw err;
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }
  }
}
