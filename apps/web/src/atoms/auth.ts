"use client";

import type { Account } from "@qriter/types";
import { atom } from "jotai";

/** 当前登录账号档案。由 /api/auth/profile 拉取成功后写入，未登录为 null。 */
export const currentUserAtom = atom<Account | null>(null);

/** 是否已登录 —— 由当前账号是否存在派生（token 在 httpOnly cookie，JS 不可读）。 */
export const isAuthenticatedAtom = atom((get) => get(currentUserAtom) != null);
