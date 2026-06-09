import Dm, { SingleSendMailRequest } from "@alicloud/dm20151123";
import * as OpenApi from "@alicloud/openapi-client";
import * as Util from "@alicloud/tea-util";
import { Logger } from "@nestjs/common";

import type { EmailConfig } from "../config/app-config.schema";

/** 邮件发送端口。验证码发送只需纯文本。 */
export interface EmailSender {
  /** 发送一封登录验证码邮件。 */
  sendCode(to: string, code: string): Promise<void>;
}

/** EmailSender 的 DI token。 */
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/**
 * 阿里云邮件推送 DirectMail API 实现（SingleSendMail，官方 SDK @alicloud/dm20151123）。
 * 用 AccessKey 签名调用，凭证走 config.email（Nacos）。
 */
export class DirectMailEmailSender implements EmailSender {
  private readonly client: Dm;
  private readonly accountName: string;
  private readonly fromAlias?: string;

  constructor(config: EmailConfig) {
    const openapi = new OpenApi.Config({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
    });
    openapi.endpoint = config.endpoint;
    this.client = new Dm(openapi);
    this.accountName = config.accountName;
    this.fromAlias = config.from;
  }

  async sendCode(to: string, code: string): Promise<void> {
    // addressType=1 用「发信地址」；replyToAddress=false 不设回信地址。
    const request = new SingleSendMailRequest({
      accountName: this.accountName,
      addressType: 1,
      replyToAddress: false,
      toAddress: to,
      subject: "Qriter 登录验证码",
      textBody: `你的 Qriter 登录验证码是 ${code}，5 分钟内有效。若非本人操作请忽略。`,
      fromAlias: this.fromAlias,
    });
    await this.client.singleSendMailWithOptions(
      request,
      new Util.RuntimeOptions({}),
    );
  }
}

/** 未配置 config.email 时的兜底：把验证码打到 server 日志（仅开发用）。 */
export class LogEmailSender implements EmailSender {
  private readonly logger = new Logger("LogEmailSender");

  async sendCode(to: string, code: string): Promise<void> {
    this.logger.warn(
      `[DEV] 未配置 config.email，邮箱验证码不真实发送 —— to=${to} code=${code}`,
    );
  }
}
