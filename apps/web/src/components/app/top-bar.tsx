import Link from "next/link";
import { AccountMenu } from "./account-menu";

/** 登录后顶栏：左宋体品牌（回书架）+ 右账号菜单。 */
export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-6">
      <Link
        href="/"
        className="font-serif text-xl font-semibold tracking-tight text-foreground"
      >
        Qriter
      </Link>
      <AccountMenu />
    </header>
  );
}
