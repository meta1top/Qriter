import { Inject, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AccountErrorCode } from "@qriter/account";
import { AppError } from "@qriter/shared";

import {
  APP_CONFIG,
  type AppConfig,
  type GithubOAuthConfig,
} from "../config/app-config.schema";

/** 归一化后的 GitHub 用户档案（与 GoogleProfile 同形，controller 补 provider）。 */
export interface GithubProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

const STATE_TTL = "10m";
const STATE_MARKER = "github_oauth_state";
const UA = "qriter";

/**
 * GitHub OAuth 服务（无 DB，纯 fetch）：构造同意页 URL、JWT 签/验 state、
 * 用 code 换 token 并调 GitHub API 取主验证邮箱。oauth.github 未配置时抛 GITHUB_OAUTH_FAILED。
 */
@Injectable()
export class GitHubOAuthService {
  private readonly github: GithubOAuthConfig | null;

  constructor(
    @Inject(APP_CONFIG) config: AppConfig,
    private readonly jwt: JwtService,
  ) {
    this.github = config.oauth?.github ?? null;
  }

  /** 签发 10min 短 JWT 作为 CSRF state。 */
  signState(): string {
    return this.jwt.sign({ t: STATE_MARKER }, { expiresIn: STATE_TTL });
  }

  /** 验 state；过期 / 篡改 / 标记不符抛 GITHUB_STATE_INVALID。 */
  verifyState(state: string): void {
    try {
      const payload = this.jwt.verify<{ t?: string }>(state);
      if (payload.t !== STATE_MARKER) throw new Error("bad marker");
    } catch {
      throw new AppError(AccountErrorCode.GITHUB_STATE_INVALID);
    }
  }

  /** 构造 GitHub 同意页 URL（内嵌签名 state）。 */
  buildConsentUrl(): string {
    const cfg = this.requireConfig();
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: cfg.redirectUri,
      scope: cfg.scopes.join(" "),
      state: this.signState(),
      allow_signup: "true",
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  /** 换 token + 取用户 + 取主验证邮箱；失败抛 GITHUB_OAUTH_FAILED / GITHUB_NO_VERIFIED_EMAIL。 */
  async exchangeCode(code: string): Promise<GithubProfile> {
    const cfg = this.requireConfig();
    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
          },
          body: JSON.stringify({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret,
            code,
            redirect_uri: cfg.redirectUri,
          }),
        },
      );
      if (!tokenRes.ok) throw new Error(`token http ${tokenRes.status}`);
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      const token = tokenJson.access_token;
      if (!token) throw new Error("no access_token");

      const headers = {
        authorization: `Bearer ${token}`,
        "user-agent": UA,
        accept: "application/vnd.github+json",
      };
      const userRes = await fetch("https://api.github.com/user", { headers });
      if (!userRes.ok) throw new Error(`user http ${userRes.status}`);
      const user = (await userRes.json()) as {
        id?: number;
        login?: string;
        name?: string | null;
      };
      if (!user.id) throw new Error("no user id");

      const emailsRes = await fetch("https://api.github.com/user/emails", {
        headers,
      });
      if (!emailsRes.ok) throw new Error(`emails http ${emailsRes.status}`);
      const emails = (await emailsRes.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const primary = Array.isArray(emails)
        ? emails.find((e) => e.primary && e.verified)
        : undefined;
      if (!primary) {
        throw new AppError(AccountErrorCode.GITHUB_NO_VERIFIED_EMAIL);
      }

      return {
        sub: String(user.id),
        email: primary.email,
        emailVerified: true,
        name: user.name || user.login || primary.email,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(AccountErrorCode.GITHUB_OAUTH_FAILED);
    }
  }

  private requireConfig(): GithubOAuthConfig {
    if (!this.github) throw new AppError(AccountErrorCode.GITHUB_OAUTH_FAILED);
    return this.github;
  }
}
