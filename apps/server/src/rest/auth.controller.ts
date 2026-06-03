import {
  type Account,
  LoginDto,
  RegisterDto,
  UserService,
} from "@qriter/account";
import type { AuthResponse } from "@qriter/types";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";

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
  ) {}

  @Public()
  // 限流：同源 IP 1 分钟内最多 5 次注册（防爬虫批量注册账号）
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: "注册新账号并返回 JWT" })
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
  @Post("login")
  @HttpCode(200)
  async login(@Body() dto: LoginDto): Promise<AuthResponse> {
    const user = await this.users.validateCredentials(dto);
    return this.signResponse(user);
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
