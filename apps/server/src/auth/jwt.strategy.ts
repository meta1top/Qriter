import { Inject, Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { type AppConfig, APP_CONFIG } from "../config/app-config.schema";

export const JWT_STRATEGY_NAME = "jwt";

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * qriter JWT Strategy，Strategy 名 `"jwt"`。
 * secret 取自 `APP_CONFIG.jwt.secret`（由 YAML / Nacos 配置而来）。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.jwt.secret,
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return { userId: payload.userId, email: payload.email };
  }
}
