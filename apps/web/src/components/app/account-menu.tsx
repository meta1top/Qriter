"use client";

import {
  Avatar,
  AvatarFallback,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@qriter/design";
import { useAtomValue } from "jotai";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { currentUserAtom } from "@/atoms/auth";
import { useLogout } from "@/rest/auth";

/** 右上账号菜单：头像 + 统计/设置入口 + 退出。 */
export function AccountMenu() {
  const t = useTranslations("account");
  const router = useRouter();
  const user = useAtomValue(currentUserAtom);
  const logout = useLogout();
  const initial = (user?.displayName ?? user?.email ?? "?")
    .charAt(0)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="rounded-full outline-none">
          <Avatar>
            <AvatarFallback>{initial}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => router.push("/stats")}>
          {t("stats")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/model")}>
          {t("modelSettings")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push("/settings/account")}>
          {t("accountSettings")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => logout.mutate()}>
          {t("logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
