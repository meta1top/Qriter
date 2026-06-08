import { Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";

import type { EmailConfig } from "../config/app-config.schema";

/** 邮件发送端口。验证码发送只需纯文本。 */
export interface EmailSender {
  /** 发送一封登录验证码邮件。 */
  sendCode(to: string, code: string): Promise<void>;
}

/** EmailSender 的 DI token。 */
export const EMAIL_SENDER = Symbol("EMAIL_SENDER");

/** 阿里云 DirectMail SMTP 实现（nodemailer）。 */
export class SmtpEmailSender implements EmailSender {
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;

  constructor(private readonly config: EmailConfig) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from ?? config.user;
  }

  async sendCode(to: string, code: string): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to,
      subject: "Qriter 登录验证码",
      text: `你的 Qriter 登录验证码是 ${code}，5 分钟内有效。若非本人操作请忽略。`,
    });
  }
}

/** 未配置 SMTP 时的兜底：把验证码打到 server 日志（仅开发用）。 */
export class LogEmailSender implements EmailSender {
  private readonly logger = new Logger("LogEmailSender");

  async sendCode(to: string, code: string): Promise<void> {
    this.logger.warn(
      `[DEV] 未配置 config.email，邮箱验证码不真实发送 —— to=${to} code=${code}`,
    );
  }
}
