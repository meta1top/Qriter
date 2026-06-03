import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

import type { JwtPayload } from "./jwt.strategy";

/**
 * 从 request 中提取 JwtStrategy.validate 返回的 user payload。
 *
 * 框架基线导出：register / login 示范没有 protected endpoint 用到它，但
 * qriter 真业务接到 server 后必然会需要。保留以避免后续重复造轮子。
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const req = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return req.user;
  },
);

export type { JwtPayload as CurrentUserPayload } from "./jwt.strategy";
