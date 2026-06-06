import { OAuth2Client } from "google-auth-library";
import { JwtService } from "@nestjs/jwt";
import { AppError } from "@qriter/shared";
import { AccountErrorCode } from "@qriter/account";

import { APP_CONFIG, type AppConfig } from "../config/app-config.schema";
import { GoogleOAuthService } from "./google-oauth.service";

const CONFIG = {
  oauth: {
    google: {
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "http://localhost:3001/auth/google",
      scopes: ["openid", "email", "profile"],
    },
  },
} as unknown as AppConfig;

function build(): GoogleOAuthService {
  const jwt = new JwtService({ secret: "unit-secret-1234567890" });
  return new GoogleOAuthService(CONFIG, jwt);
}

describe("GoogleOAuthService.state", () => {
  it("signState → verifyState 往返通过", () => {
    const svc = build();
    const state = svc.signState();
    expect(() => svc.verifyState(state)).not.toThrow();
  });

  it("篡改 / 非法 state 抛 GOOGLE_STATE_INVALID", () => {
    const svc = build();
    try {
      svc.verifyState("not-a-jwt");
      fail("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe(
        AccountErrorCode.GOOGLE_STATE_INVALID,
      );
    }
  });

  it("buildConsentUrl 含 client_id 与 state", () => {
    const svc = build();
    const url = svc.buildConsentUrl();
    expect(url).toContain("accounts.google.com");
    expect(url).toContain("client_id=cid");
    expect(url).toContain("state=");
  });
});

describe("GoogleOAuthService.exchangeCode", () => {
  afterEach(() => jest.restoreAllMocks());

  it("成功换取并归一化 profile", async () => {
    jest
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockResolvedValue({ tokens: { id_token: "idtok" } } as never);
    jest.spyOn(OAuth2Client.prototype, "verifyIdToken").mockResolvedValue({
      getPayload: () => ({
        sub: "g-sub-1",
        email: "a@b.com",
        email_verified: true,
        name: "Alice",
      }),
    } as never);

    const profile = await build().exchangeCode("code-xyz");
    expect(profile).toEqual({
      sub: "g-sub-1",
      email: "a@b.com",
      emailVerified: true,
      name: "Alice",
    });
  });

  it("换取失败抛 GOOGLE_OAUTH_FAILED", async () => {
    jest
      .spyOn(OAuth2Client.prototype, "getToken")
      .mockRejectedValue(new Error("invalid_grant") as never);
    await expect(build().exchangeCode("bad")).rejects.toMatchObject({
      errorCode: AccountErrorCode.GOOGLE_OAUTH_FAILED,
    });
  });
});
