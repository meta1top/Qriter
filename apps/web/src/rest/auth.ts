"use client";

import type { Account, LoginInput, RegisterInput } from "@qriter/types";
import { apiClient } from "@qriter/web-common";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { currentUserAtom } from "@/atoms/auth";

/** profile 查询 key。 */
export const profileQueryKey = ["auth", "profile"] as const;

/** 登录（cookie 由 route handler 下发，响应只含 user）。 */
export async function login(input: LoginInput): Promise<Account> {
  const { data } = await apiClient.post<{ user: Account }>(
    "/api/auth/login",
    input,
  );
  return data.user;
}

/** 注册。 */
export async function register(input: RegisterInput): Promise<Account> {
  const { data } = await apiClient.post<{ user: Account }>(
    "/api/auth/register",
    input,
  );
  return data.user;
}

/** 退出登录（清 cookie）。 */
export async function logout(): Promise<void> {
  await apiClient.post("/api/auth/logout");
}

/** 拉取当前账号档案（经 proxy → Nest，envelope 已解包）。 */
export async function fetchProfile(): Promise<Account> {
  const { data } = await apiClient.get<Account>("/api/auth/profile");
  return data;
}

export function useLogin() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: login,
    onSuccess: (user) => {
      setCurrentUser(user);
      qc.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: register,
    onSuccess: (user) => {
      setCurrentUser(user);
      qc.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setCurrentUser(null);
      qc.clear();
      window.location.href = "/login";
    },
  });
}

export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    enabled,
    retry: false,
  });
}
