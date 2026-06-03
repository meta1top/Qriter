"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@qriter/design";
import Link from "next/link";
import { useTranslations } from "next-intl";

export default function Home() {
  const tCommon = useTranslations("common");
  const tHome = useTranslations("home");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {tCommon("appTitle")}
          </CardTitle>
          <CardDescription>{tHome("tagline")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link href="/login">{tHome("goToLogin")}</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
