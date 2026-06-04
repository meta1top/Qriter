import {
  ErrorsFilter,
  I18nZodValidationPipe,
  loadAppConfig,
  ResponseInterceptor,
  traceIdMiddleware,
} from "@qriter/shared";
import { NestFactory, Reflector } from "@nestjs/core";
import { I18nService } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { setupSwagger } from "./app.swagger";

async function bootstrap() {
  // 引导式配置：Nest 起来前先把 YAML / Nacos 的配置写进 process.env，
  // 供下面 AppModule 的 ConfigModule + EnvSchema 照常校验。
  await loadAppConfig({
    cwd: process.cwd(),
    envFiles: [".env.development", ".env"],
    yamlFiles: ["config/application.yml", "config/application.local.yml"],
  });

  const app = await NestFactory.create(AppModule);

  // 标准全局链路（顺序：trace → pipe → interceptor → filter）
  // - traceIdMiddleware：注入 / 透传 x-trace-id，让后续 interceptor / filter / 日志可追溯
  // - I18nZodValidationPipe：DTO 校验 + i18n key 翻译
  // - ResponseInterceptor：成功响应包 envelope {success, code:0, data, ...}
  // - ErrorsFilter：异常统一为 envelope {success:false, code, message, data, ...}
  app.use(traceIdMiddleware);
  const i18n = app.get(I18nService);
  const reflector = app.get(Reflector);
  app.useGlobalPipes(new I18nZodValidationPipe(i18n));
  app.useGlobalInterceptors(new ResponseInterceptor(reflector));
  app.useGlobalFilters(new ErrorsFilter(i18n));

  app.setGlobalPrefix("api");

  // dev 模式挂载 Swagger UI（/api/docs）；生产不挂载避免泄漏内部 API 结构
  if (process.env.NODE_ENV !== "production") {
    setupSwagger(app);
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  console.log(`qriter server running on http://localhost:${port}`);
}

bootstrap();
