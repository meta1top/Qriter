import Link from "next/link";
import { AccountMenu } from "./account-menu";

/** 登录后顶栏：左品牌标记 + 宋体品牌（回书架）+ 右账号菜单。 */
export function TopBar() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-8">
      <Link href="/" className="flex items-center gap-2">
        <span className="size-2 rounded-[2px] bg-primary" aria-hidden />
        <span className="font-serif text-xl font-semibold tracking-[0.5px] text-foreground">
          Qriter
        </span>
      </Link>
      <AccountMenu />
    </header>
  );
}
