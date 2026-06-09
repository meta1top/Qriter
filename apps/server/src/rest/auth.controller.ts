import {
  type Account,
  AccountDto,
  AccountErrorCode,
  AccountIdentityService,
  AuthResponseDto,
  EmailLoginDto,
  OAuthCodeDto,
  LoginDto,
  RegisterDto,
  SendEmailCodeDto,
  UserService,
} from "@qriter/account";
import { SkipResponseEnvelope } from "@qriter/common";
import { AppError } from "@qriter/shared";
import type { Account as AccountProfile, AuthResponse } from "@qriter/types";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Redirect,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

import {
  CurrentUser,
  type CurrentUserPayload,
} from "../auth/current-user.decorator";
import { EmailOtpService } from "../auth/email-otp.service";
import { GoogleOAuthService } from "../auth/google-oauth.service";
import { Public } from "../auth/public.decorator";

/**
 * 认证相关 endpoint。register / login 均公开访问。
 * Controller 只负责接收 DTO + 签 token + 返回，业务逻辑下沉到 UserService。
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly users: UserService,
    private readonly jwt: JwtService,
    private readonly identities: AccountIdentityService,
    private readonly googleOAuth: GoogleOAuthService,
    private readonly emailOtp: EmailOtpService,
  ) {}

  @Public()
  // 限流：同源 IP 1 分钟内最多 5 次注册（防爬虫批量注册账号）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "注册新账号并返回 JWT" })
  @ApiBody({ type: RegisterDto })
  @ApiCreatedResponse({
    description: "注册成功，envelope.data 为 accessToken + 账号公开档案",
    type: AuthResponseDto,
  })
  @Post("register")
  @HttpCode(201)
  async register(@Body() dto: RegisterDto): Promise<AuthResponse> {
    const user = await this.users.register(dto);
    return this.signResponse(user);
  }

  @Public()
  // 限流：同源 IP 1 分钟内最多 10 次登录（防密码爆破）
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "登录并返回 JWT" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({
    description: "登录成功，envelope.data 为 accessToken + 账号公开档案",
    type: AuthResponseDto,
  })
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.validateCredentials(dto);
    return this.signResponse(user);
  }

  @Public()
  // 限流：同 IP 1 分钟最多 5 次发码请求
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "发送邮箱登录验证码" })
  @ApiBody({ type: SendEmailCodeDto })
  @ApiOkResponse({ description: "已发送（不泄露邮箱是否注册）" })
  @Post("email/code")
  @HttpCode(200)
  async sendEmailCode(@Body() dto: SendEmailCodeDto): Promise<{ ok: true }> {
    await this.emailOtp.sendCode(dto.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "邮箱验证码登录（免密 find-or-create）" })
  @ApiBody({ type: EmailLoginDto })
  @ApiOkResponse({
    description: "登录成功，data 为 accessToken + 账号档案",
    type: AuthResponseDto,
  })
  @Post("email/login")
  @HttpCode(200)
  async emailLogin(@Body() dto: EmailLoginDto): Promise<AuthResponse> {
    const account = await this.emailOtp.verifyAndFindOrCreate(
      dto.email,
      dto.code,
    );
    return this.signResponse(account);
  }

  @Public()
  @SkipResponseEnvelope()
  @ApiOperation({ summary: "重定向到 Google 同意页" })
  @Get("google")
  @Redirect()
  googleStart(): { url: string } {
    return { url: this.googleOAuth.buildConsentUrl() };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "用 Google 授权码换取 JWT" })
  @ApiBody({ type: OAuthCodeDto })
  @ApiOkResponse({
    description: "登录成功，data 为 accessToken + 档案",
    type: AuthResponseDto,
  })
  @Post("google")
  @HttpCode(200)
  async googleCallback(@Body() dto: OAuthCodeDto): Promise<AuthResponse> {
    this.googleOAuth.verifyState(dto.state);
    const profile = await this.googleOAuth.exchangeCode(dto.code);
    const account = await this.identities.findOrCreateByGoogle({
      provider: "google",
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.emailVerified,
      name: profile.name,
    });
    return this.signResponse(account);
  }

  @ApiOperation({ summary: "当前登录账号公开档案" })
  @ApiOkResponse({ description: "当前账号档案", type: AccountDto })
  @Get("profile")
  async profile(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<AccountProfile> {
    const account = await this.users.findById(user.userId);
    if (!account) throw new AppError(AccountErrorCode.ACCOUNT_NOT_FOUND);
    return this.users.toProfile(account);
  }

  @ApiOperation({ summary: "签发 60s 短时效 WS ticket" })
  @Get("ws-ticket")
  wsTicket(@CurrentUser() user: CurrentUserPayload): { ticket: string } {
    const ticket = this.jwt.sign(
      { userId: user.userId, email: user.email, t: "ws" },
      { expiresIn: "60s" },
    );
    return { ticket };
  }

  private signResponse(user: Account): AuthResponse {
    const accessToken = this.jwt.sign({ userId: user.id, email: user.email });
    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }
}
