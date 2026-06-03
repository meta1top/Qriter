"use client";

import { getAccessToken } from "@qriter/common";
import type { Account } from "@qriter/types";
import { atom } from "jotai";

/**
 * 访问令牌 atom —— 单一来源。
 *
 * 初值从 localStorage 读取（SSR 阶段为 null），登录成功后由 useLogin 写入，
 * 退出 / 401 时清空。写令牌的副作用（落 localStorage）由 @qriter/common 的
 * setAccessToken / clearAccessToken 负责，这里只持有内存态。
 */
export const accessTokenAtom = atom<string | null>(
  typeof window === "undefined" ? null : getAccessToken(),
);

/**
 * 当前登录账号档案。
 *
 * 由 profile 查询成功后写入（见 rest/auth.ts 的 useProfile），未登录 /
 * 加载中为 null。
 */
export const currentUserAtom = atom<Account | null>(null);

/** 是否已登录 —— 由访问令牌是否存在派生。 */
export const isAuthenticatedAtom = atom((get) => get(accessTokenAtom) != null);
