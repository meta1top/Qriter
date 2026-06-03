"use client";

import { apiClient, setAccessToken } from "@qriter/common";
import type {
  Account,
  AuthResponse,
  LoginInput,
  RegisterInput,
} from "@qriter/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSetAtom } from "jotai";
import { accessTokenAtom, currentUserAtom } from "@/atoms/auth";

/** profile 查询 key —— 登录 / 注册成功后据此失效以刷新当前账号。 */
export const profileQueryKey = ["auth", "profile"] as const;

/** 调用登录端点，成功后落 token 并返回响应。 */
export async function login(input: LoginInput): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/api/auth/login", input);
  setAccessToken(data.accessToken);
  return data;
}

/** 调用注册端点，成功后落 token 并返回响应。 */
export async function register(input: RegisterInput): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    "/api/auth/register",
    input,
  );
  setAccessToken(data.accessToken);
  return data;
}

/** 拉取当前账号公开档案。 */
export async function fetchProfile(): Promise<Account> {
  const { data } = await apiClient.get<Account>("/api/auth/profile");
  return data;
}

/** 登录 mutation —— 成功后写入令牌与当前账号 atom，并失效 profile 查询。 */
export function useLogin() {
  const queryClient = useQueryClient();
  const setAccessTokenAtom = useSetAtom(accessTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: login,
    onSuccess: (data) => {
      setAccessTokenAtom(data.accessToken);
      setCurrentUser(data.user);
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

/** 注册 mutation —— 成功后写入令牌与当前账号 atom，并失效 profile 查询。 */
export function useRegister() {
  const queryClient = useQueryClient();
  const setAccessTokenAtom = useSetAtom(accessTokenAtom);
  const setCurrentUser = useSetAtom(currentUserAtom);
  return useMutation({
    mutationFn: register,
    onSuccess: (data) => {
      setAccessTokenAtom(data.accessToken);
      setCurrentUser(data.user);
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
  });
}

/** profile 查询 —— 仅在持有令牌时启用，作为已登录态的二次确认来源。 */
export function useProfile(enabled: boolean) {
  return useQuery({
    queryKey: profileQueryKey,
    queryFn: fetchProfile,
    enabled,
    retry: false,
  });
}
