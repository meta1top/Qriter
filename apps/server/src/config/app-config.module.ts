import { type DynamicModule, Global, Module } from "@nestjs/common";
import { type AppConfig, APP_CONFIG } from "./app-config.schema";

/**
 * 全局配置模块 —— 把 `loadAppConfig` 在 Nest 外加载好的强类型 `AppConfig`
 * 通过 `APP_CONFIG` token 提供并导出到全局。
 *
 * `@Global()` + `exports`：Nest 11 模块封装严，被 import 的子模块（AuthModule /
 * RedisModule / AgentModule 等）的 provider 看不到宿主模块的本地 provider；
 * 必须靠全局导出，各模块才能 `@Inject(APP_CONFIG)` 取到同一份配置。
 */
@Global()
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
