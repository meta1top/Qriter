"use client";

import { Button, Input, toast } from "@qriter/design";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  GithubIcon,
  GoogleIcon,
  WechatIcon,
} from "@/components/auth/social-icons";
import { sendEmailCode, useEmailLogin } from "@/rest/auth";

const RESEND_SECONDS = 60;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const emailLogin = useEmailLogin();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [sending, setSending] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const startCooldown = () => {
    setCooldown(RESEND_SECONDS);
    timer.current = setInterval(() => {
      setCooldown((s) => {
        if (s <= 1 && timer.current) clearInterval(timer.current);
        return s - 1;
      });
    }, 1000);
  };

  const onSend = async () => {
    if (!EMAIL_RE.test(email) || cooldown > 0 || sending) return;
    setSending(true);
    try {
      await sendEmailCode(email);
      toast.success(t("codeSent"));
      startCooldown();
    } catch {
      toast.error(t("sendCodeFailed"));
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) return;
    try {
      await emailLogin.mutateAsync({ email, code });
      router.push("/");
    } catch {
      toast.error(t("loginFailed"));
    }
  };

  const comingSoon = () => toast(t("socialComingSoon"));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-[26px] font-semibold tracking-[0.5px] text-foreground">
          {t("loginTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("emailLoginSubtitle")}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label
          htmlFor="login-email"
          className="flex flex-col gap-1.5 text-[12px] font-medium tracking-[0.3px] text-foreground/85"
        >
          {t("email")}
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label
          htmlFor="login-code"
          className="flex flex-col gap-1.5 text-[12px] font-medium tracking-[0.3px] text-foreground/85"
        >
          {t("codeLabel")}
          <div className="flex gap-2">
            <Input
              id="login-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder={t("codePlaceholder")}
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
            <Button
              type="button"
              variant="outline"
              className="shrink-0 whitespace-nowrap"
              disabled={!EMAIL_RE.test(email) || cooldown > 0 || sending}
              onClick={onSend}
            >
              {cooldown > 0 ? t("resendIn", { sec: cooldown }) : t("sendCode")}
            </Button>
          </div>
        </label>

        <Button
          type="submit"
          className="mt-2 w-full"
          disabled={emailLogin.isPending || !/^\d{6}$/.test(code)}
        >
          {emailLogin.isPending ? t("submitting") : t("submit")}
        </Button>
      </form>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          aria-label={t("loginWithGoogle")}
          title={t("loginWithGoogle")}
          onClick={() => {
            window.location.href = "/api/auth/google";
          }}
          className="flex size-11 items-center justify-center rounded-lg border border-border transition hover:bg-primary/[0.07]"
        >
          <GoogleIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t("loginWithGithub")}
          title={t("loginWithGithub")}
          onClick={comingSoon}
          className="flex size-11 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-primary/[0.07]"
        >
          <GithubIcon className="size-5" />
        </button>
        <button
          type="button"
          aria-label={t("loginWithWechat")}
          title={t("loginWithWechat")}
          onClick={comingSoon}
          className="flex size-11 items-center justify-center rounded-lg border border-border transition hover:bg-primary/[0.07]"
        >
          <WechatIcon className="size-5" />
        </button>
      </div>
    </div>
  );
}
