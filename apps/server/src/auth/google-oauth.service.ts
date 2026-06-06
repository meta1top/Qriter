import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountErrorCode } from "@qriter/account";
import { AppError } from "@qriter/shared";
import { OAuth2Client } from "google-auth-library";

import {
  APP_CONFIG,
  type AppConfig,
  type GoogleOAuthConfig,
} from "../config/app-config.schema";

/** 归一化后的 Google 用户档案。 */
export interface GoogleProfile {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
}

const STATE_TTL = "10m";
const STATE_MARKER = "oauth_state";

/**
 * Google OAuth 服务（无 DB）：构造同意页 URL、用 JwtService 签/验无状态 state、
 * 用 code 换 token 并验 id_token。oauth.google 未配置时各方法抛 GOOGLE_OAUTH_FAILED。
 */
@Injectable()
export class GoogleOAuthService {
  private readonly google: GoogleOAuthConfig | null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly jwt: JwtService,
  ) {
    this.google = config.oauth?.google ?? null;
  }

  /** 签发 10min 短 JWT 作为 CSRF state。 */
  signState(): string {
    return this.jwt.sign({ t: STATE_MARKER }, { expiresIn: STATE_TTL });
  }

  /** 验 state；过期 / 篡改 / 标记不符抛 GOOGLE_STATE_INVALID。 */
  verifyState(state: string): void {
    try {
      const payload = this.jwt.verify<{ t?: string }>(state);
      if (payload.t !== STATE_MARKER) throw new Error("bad marker");
    } catch {
      throw new AppError(AccountErrorCode.GOOGLE_STATE_INVALID);
    }
  }

  /** 构造 Google 同意页 URL（内嵌签名 state）。 */
  buildConsentUrl(): string {
    const client = this.requireClient();
    return client.generateAuthUrl({
      scope: this.google!.scopes,
      state: this.signState(),
      prompt: "select_account",
    });
  }

  /** 用 code 换 token 并验 id_token，返回归一化档案；失败抛 GOOGLE_OAUTH_FAILED。 */
  async exchangeCode(code: string): Promise<GoogleProfile> {
    const client = this.requireClient();
    try {
      const { tokens } = await client.getToken(code);
      const idToken = tokens.id_token;
      if (!idToken) throw new Error("no id_token");
      const ticket = await client.verifyIdToken({
        idToken,
        audience: this.google!.clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub) throw new Error("no sub");
      return {
        sub: payload.sub,
        email: payload.email ?? null,
        emailVerified: payload.email_verified === true,
        name: payload.name ?? payload.email ?? payload.sub,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);
    }
  }

  private requireClient(): OAuth2Client {
    if (!this.google) throw new AppError(AccountErrorCode.GOOGLE_OAUTH_FAILED);
    return new OAuth2Client({
      clientId: this.google.clientId,
      clientSecret: this.google.clientSecret,
      redirectUri: this.google.redirectUri,
    });
  }
}
