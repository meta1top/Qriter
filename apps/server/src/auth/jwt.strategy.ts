import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export const JWT_STRATEGY_NAME = "jwt";

export interface JwtPayload {
  userId: string;
  email: string;
}

/**
 * qriter JWT Strategy，Strategy 名 `"jwt"`。
 * secret 从 env 强制读取（getOrThrow），不允许默认兜底。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_STRATEGY_NAME) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>("JWT_SECRET"),
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return { userId: payload.userId, email: payload.email };
  }
}
