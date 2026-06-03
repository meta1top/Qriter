import { AccountModule } from "@qriter/account";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule, type JwtModuleOptions } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";

import { JwtStrategy } from "./jwt.strategy";

/**
 * 认证模块。
 *
 * - PassportModule + JwtModule：签发 / 校验 JWT。
 * - AccountModule：注册 / 登录业务（UserService）由账号域提供。
 * - 导出 JwtModule / PassportModule，让 AuthController（rest/）与 WS gateway
 *   能注入 JwtService。
 */
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): JwtModuleOptions => ({
        secret: cfg.getOrThrow<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: (cfg.get<string>("JWT_EXPIRES") ?? "7d") as `${number}d`,
        },
      }),
    }),
    AccountModule,
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, PassportModule, AccountModule],
})
export class AuthModule {}
