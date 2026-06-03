import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/**
 * Swagger UI 配置（dev 模式启用）。
 *
 * 访问：`http://localhost:3000/api/docs`
 *
 * 包含：
 * - Bearer JWT 安全方案（id = "jwt"，与 JwtStrategy 名称对齐）
 * - 自动从 controller decorator 提取 `@ApiTags` / `@ApiOperation` / `@ApiOkResponse`
 *
 * 生产模式不挂载（避免泄漏内部 API 结构）。
 */
export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("qriter API")
    .setDescription("qriter 写作平台后端 —— register / login + 业务接口")
    .setVersion("0.0.1")
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      "jwt",
    )
    .addSecurityRequirements("jwt")
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api/docs", app, doc, {
    swaggerOptions: { persistAuthorization: true },
  });
}
