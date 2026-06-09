import { JwtService } from "@nestjs/jwt";
import { AppError } from "@qriter/shared";
import { AccountErrorCode } from "@qriter/account";

import type { AppConfig } from "../config/app-config.schema";
import { GitHubOAuthService } from "./github-oauth.service";

const CONFIG = {
  oauth: {
    github: {
      clientId: "cid",
      clientSecret: "secret",
      redirectUri: "http://localhost:3001/auth/github",
      scopes: ["read:user", "user:email"],
    },
  },
} as unknown as AppConfig;

const NO_OAUTH_CONFIG = {} as unknown as AppConfig;

function jwt(): JwtService {
  return new JwtService({ secret: "unit-secret-1234567890" });
}

function build(): GitHubOAuthService {
  return new GitHubOAuthService(CONFIG, jwt());
}

/** 构造一个伪造的 JSON Response（默认 200）。 */
function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GitHubOAuthService.state", () => {
  it("signState → verifyState 往返通过", () => {
    const svc = build();
    const state = svc.signState();
    expect(() => svc.verifyState(state)).not.toThrow();
  });

  it("篡改 / 非法 state 抛 GITHUB_STATE_INVALID", () => {
    const svc = build();
    try {
      svc.verifyState("garbage");
      fail("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe(
        AccountErrorCode.GITHUB_STATE_INVALID,
      );
    }
  });

  it("marker 不符的 state 抛 GITHUB_STATE_INVALID", () => {
    const signer = jwt();
    const svc = new GitHubOAuthService(CONFIG, signer);
    const wrong = signer.sign({ t: "other" });
    try {
      svc.verifyState(wrong);
      fail("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe(
        AccountErrorCode.GITHUB_STATE_INVALID,
      );
    }
  });
});

describe("GitHubOAuthService.buildConsentUrl", () => {
  it("返回 authorize URL，含 client_id、space-join scope、state", () => {
    const svc = build();
    const url = svc.buildConsentUrl();
    expect(url.startsWith("https://github.com/login/oauth/authorize?")).toBe(
      true,
    );
    expect(url).toContain("client_id=cid");
    expect(url).toContain("scope=read%3Auser+user%3Aemail");
    expect(url).toContain("state=");
  });

  it("oauth.github 未配置时抛 GITHUB_OAUTH_FAILED", () => {
    const svc = new GitHubOAuthService(NO_OAUTH_CONFIG, jwt());
    try {
      svc.buildConsentUrl();
      fail("应当抛错");
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).errorCode).toBe(
        AccountErrorCode.GITHUB_OAUTH_FAILED,
      );
    }
  });
});

describe("GitHubOAuthService.exchangeCode", () => {
  afterEach(() => jest.restoreAllMocks());

  /** 按 url 路由伪造 fetch：token / user / emails。 */
  function mockFetch(opts: {
    token?: Response;
    user?: Response;
    emails?: Response;
  }): void {
    jest
      .spyOn(globalThis, "fetch")
      .mockImplementation((input: Parameters<typeof fetch>[0]) => {
        const url = String(input);
        if (url.includes("access_token")) {
          return Promise.resolve(opts.token ?? jsonRes({ access_token: "t" }));
        }
        if (url.endsWith("/user/emails")) {
          return Promise.resolve(opts.emails ?? jsonRes([]));
        }
        if (url.endsWith("/user")) {
          return Promise.resolve(opts.user ?? jsonRes({ id: 1 }));
        }
        return Promise.reject(new Error(`unexpected url ${url}`));
      });
  }

  it("happy path 归一化 profile（无 provider 字段）", async () => {
    mockFetch({
      token: jsonRes({ access_token: "t" }),
      user: jsonRes({ id: 99, login: "octocat", name: "Octo" }),
      emails: jsonRes([{ email: "o@e.test", primary: true, verified: true }]),
    });

    const profile = await build().exchangeCode("code-xyz");
    expect(profile).toEqual({
      sub: "99",
      email: "o@e.test",
      emailVerified: true,
      name: "Octo",
    });
  });

  it("无主验证邮箱抛 GITHUB_NO_VERIFIED_EMAIL", async () => {
    mockFetch({
      user: jsonRes({ id: 99, login: "octocat", name: "Octo" }),
      emails: jsonRes([{ email: "x@e.test", primary: true, verified: false }]),
    });
    await expect(build().exchangeCode("code")).rejects.toMatchObject({
      errorCode: AccountErrorCode.GITHUB_NO_VERIFIED_EMAIL,
    });
  });

  it("token 接口非 ok 抛 GITHUB_OAUTH_FAILED", async () => {
    mockFetch({ token: new Response("err", { status: 401 }) });
    await expect(build().exchangeCode("bad")).rejects.toMatchObject({
      errorCode: AccountErrorCode.GITHUB_OAUTH_FAILED,
    });
  });

  it("name 缺失时回退 login", async () => {
    mockFetch({
      user: jsonRes({ id: 7, login: "loginonly", name: null }),
      emails: jsonRes([{ email: "l@e.test", primary: true, verified: true }]),
    });
    const profile = await build().exchangeCode("code");
    expect(profile.name).toBe("loginonly");
  });
});
