"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "@qriter/design";
import { Form, FormItem } from "@qriter/design/form";
import { useSchema } from "@qriter/design/hooks";
import { type LoginInput, LoginSchema } from "@qriter/types";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLogin } from "@/rest/auth";

export default function LoginPage() {
  const router = useRouter();
  const loginMutation = useLogin();
  const t = useTranslations("auth");
  const schema = useSchema(LoginSchema);

  const onSubmit = async (values: LoginInput) => {
    try {
      await loginMutation.mutateAsync(values);
      router.push("/");
    } catch {
      // 错误经 loginMutation.error 暴露给下方 Alert
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {t("loginTitle")}
          </CardTitle>
          <CardDescription>{t("loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form
            schema={schema}
            defaultValues={{ email: "", password: "" }}
            onSubmit={onSubmit}
            className="flex flex-col gap-4"
          >
            <FormItem name="email" label={t("email")}>
              <Input
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
              />
            </FormItem>

            <FormItem name="password" label={t("password")}>
              <Input type="password" autoComplete="current-password" />
            </FormItem>

            {loginMutation.error ? (
              <Alert variant="destructive">
                <AlertDescription>{t("loginFailed")}</AlertDescription>
              </Alert>
            ) : null}

            <Button
              type="submit"
              className="mt-2 w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? t("submitting") : t("submit")}
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                window.location.href = "/api/auth/google";
              }}
            >
              {t("signInWithGoogle")}
            </Button>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
