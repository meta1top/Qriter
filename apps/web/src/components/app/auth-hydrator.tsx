"use client";

import type { Account } from "@qriter/types";
import { useSetAtom } from "jotai";
import { useEffect } from "react";
import { currentUserAtom } from "@/atoms/auth";

/**
 * 把 (app)/layout 服务端取到的 profile 水合进 currentUserAtom。
 * jotai Provider 在 RootLayout 的 Providers 内、本组件之上，故可正常 set。
 */
export function AuthHydrator({ user }: { user: Account }) {
  const setCurrentUser = useSetAtom(currentUserAtom);
  useEffect(() => {
    setCurrentUser(user);
  }, [user, setCurrentUser]);
  return null;
}
