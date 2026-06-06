import { AccountModule } from "@qriter/account";
import { Module } from "@nestjs/common";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { type AppConfig, APP_CONFIG } from "../config/app-config.schema";
import { JwtStrategy } from "./jwt.strategy";

/**
 * 认证模块。
 *
 * - PassportModule + JwtModule：签发 / 校验 JWT，密钥 / 过期取自 `APP_CONFIG.jwt`。
 * - AccountModule：注册 / 登录业务（UserService）由账号域提供。
 * - 导出 JwtModule / PassportModule，让 AuthController（rest/）与 WS gateway
 *   能注入 JwtService。
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): JwtModuleOptions => ({
        secret: config.jwt.secret,
        signOptions: {
          expiresIn: config.jwt.expires as `${number}${"s" | "m" | "h" | "d"}`,
        },
      }),
    }),
    AccountModule,
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule, AccountModule],
})
export class AuthModule {}
