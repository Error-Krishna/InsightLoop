import { ObjectId } from 'mongodb';
import { AuthRepository, type CompanyDoc } from './auth.repository.js';
import { hashPassword, verifyPassword } from '../../utils/crypto.js';
import { BadRequestError, UnauthorizedError, BadGatewayError } from '../../utils/errors.js';
import { generateTokens, verifyToken } from '../../utils/jwt.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
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
      business_type: 'Data & Insights Platform',
      email,
      created_at: new Date(),
      updated_at: new Date(),
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
      notifications: { comments: true, weekly_summary: false, updates: true },
      created_at: new Date(),
      last_login: new Date(),
    };

    let userId: ObjectId;
    try {
      userId = await AuthRepository.createUser(userDoc);
    } catch (err: unknown) {
      // Clean up orphan company if signup fails
      await AuthRepository.deleteCompanyById(compId);
      const isDupKey =
        (err as { code?: number })?.code === 11000 ||
        /E11000|duplicate key/i.test((err as Error)?.message || '');
      if (isDupKey) {
        throw new BadRequestError('Email already registered.');
      }
      throw err;
    }

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
    const rawToken = input.credential ?? input.id_token;
    if (!rawToken) {
      throw new BadRequestError('Missing Google credential.');
    }

    const token = encodeURIComponent(rawToken);
    const tokeninfoBase = env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
    const tokeninfoUrl = `${tokeninfoBase}?id_token=${token}`;

    let response: Response;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 10000);
      try {
        response = await fetch(tokeninfoUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: unknown) {
      logger.error({ err }, 'Google tokeninfo request failed');
      throw new BadGatewayError('Could not verify Google credential.');
    }

    if (!response.ok) {
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }

    const data = (await response.json()) as {
      aud?: string;
      email?: string;
      email_verified?: string | boolean;
      name?: string;
    };

    const expectedClientId = env.GOOGLE_CLIENT_ID;
    if (!expectedClientId || data.aud !== expectedClientId) {
      logger.warn({ aud: data.aud, expectedClientId }, 'Google token audience mismatch');
      throw new UnauthorizedError('Google credential was not issued for this application.');
    }

    const email = (data.email ?? '').trim().toLowerCase();
    if (!email) {
      throw new BadRequestError('Google account has no email.');
    }

    if (data.email_verified !== 'true' && data.email_verified !== true) {
      throw new UnauthorizedError('Google email is not verified.');
    }

    const name = data.name?.trim() || email.split('@')[0];

    let user = await AuthRepository.findUserByEmail(email);
    let company: CompanyDoc | null = null;

    if (!user) {
      const companyId = crypto.randomUUID();
      const compId = await AuthRepository.createCompany({
        company_id: companyId,
        name: `${name}'s Company`,
        email,
        business_type: 'Data & Insights Platform',
        workspace_settings: {
          realtime_dashboard_refresh: true,
          jwt_session_authentication: true,
          ai_assistant_enabled: true,
          inventory_workspace_mode: true,
        },
        created_at: new Date(),
        updated_at: new Date(),
      });

      const randomPassword = hashPassword(crypto.randomBytes(32).toString('hex'));
      try {
        const userId = await AuthRepository.createUser({
          name,
          email,
          username: email.split('@')[0],
          password: randomPassword,
          company: compId,
          subscription: 'Pro Plan (₹499/mo)',
          notifications: { comments: true, weekly_summary: false, updates: true },
          created_at: new Date(),
          last_login: new Date(),
        });

        user = await AuthRepository.findUserById(userId);
        company = await AuthRepository.findCompany({ _id: compId });
      } catch (err: unknown) {
        // Handle race condition: another concurrent request created the user first
        const isDup = err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000;
        if (isDup) {
          // Remove duplicate orphan company
          await AuthRepository.deleteCompanyById(compId);
          user = await AuthRepository.findUserByEmail(email);
          if (user?.company) {
            const companyQuery = ObjectId.isValid(user.company)
              ? { _id: new ObjectId(user.company) }
              : { company_id: String(user.company) };
            company = await AuthRepository.findCompany(companyQuery);
          }
        } else {
          throw err;
        }
      }
    } else {
      await AuthRepository.updateLastLogin(user._id);
      if (user.company) {
        const companyQuery = ObjectId.isValid(user.company)
          ? { _id: new ObjectId(user.company) }
          : { company_id: String(user.company) };
        company = await AuthRepository.findCompany(companyQuery);
      }
    }

    if (!user) {
      throw new UnauthorizedError('Invalid or expired Google credential.');
    }

    const companyId = company?.company_id ?? (user.company_id ? String(user.company_id) : '');
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
        company_name: company?.name ?? `${name}'s Company`,
      },
    };
  }
}
