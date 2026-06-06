import {
  ErrorsFilter,
  I18nZodValidationPipe,
  loadAppConfig,
  ResponseInterceptor,
  traceIdMiddleware,
} from "@qriter/common";
import { NestFactory, Reflector } from "@nestjs/core";
import { I18nService } from "nestjs-i18n";
import { AppModule } from "./app.module";
import { setupSwagger } from "./app.swagger";
import { AppConfigSchema } from "./config/app-config.schema";

async function bootstrap() {
  // 配置加载在 Nest 生命周期之外：从 YAML / Nacos 读成强类型嵌套 AppConfig 并校验。
  const config = await loadAppConfig(AppConfigSchema, {
    cwd: process.cwd(),
    envFiles: [".env"],
    yamlFiles: ["config/application.yml", "config/application.local.yml"],
  });

  // 再经 AppModule.forRoot(config) 把各切片分发给对应模块（TypeORM / Redis / JWT…）。
  const app = await NestFactory.create(AppModule.forRoot(config));

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

  // dev 模式挂载 Swagger UI（/api/docs）；生产不挂载避免泄漏内部 API 结构。
  // 运行模式取自 NODE_ENV（部署环境身份），不取自 Nacos 配置。
  if (process.env.NODE_ENV !== "production") {
    setupSwagger(app);
  }

  await app.listen(config.port);
  console.log(`qriter server running on http://localhost:${config.port}`);
}

bootstrap();
