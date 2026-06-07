import axios, { type AxiosInstance } from "axios";

const DEFAULT_API_URL = "http://127.0.0.1:3000";

function resolveBaseURL(): string {
  if (typeof window === "undefined") return DEFAULT_API_URL;
  const { protocol, hostname } = window.location;
  if (protocol === "http:" || protocol === "https:") {
    const apiHost =
      hostname === "localhost" || hostname === "[::1]" ? "127.0.0.1" : hostname;
    return `${protocol}//${apiHost}:3000`;
  }
  return DEFAULT_API_URL;
}

/** 返回浏览器侧推导出的 server API base URL（SSR 环境回退到默认值）。 */
export function getBrowserApiBaseUrl(): string {
  return resolveBaseURL();
}

/**
 * 解包 server 端统一响应 envelope。
 *
 * server 全局 ResponseInterceptor 把成功响应包成
 * `{ success, code, message, data, ... }`。识别该结构（同时含 success 与
 * data 字段）则取内层 `data`；否则（@SkipResponseEnvelope 路由 / 裸响应）原样返回。
 *
 * 约定：ResponseInterceptor 是唯一产生 `{success, data}` 包装的层；业务 DTO
 * 不应同时含 success + data 字段，否则会被误解包。
 *
 * 返回 `unknown` —— 这是运行时转换，调用方经 `apiClient.get<T>()` 声明的
 * 泛型类型不参与此处校验。
 */
export function unwrapEnvelope(body: unknown): unknown {
  if (
    body !== null &&
    typeof body === "object" &&
    "success" in body &&
    "data" in body
  ) {
    // data 可能合法地为 null（void 返回的端点），原样返回
    return (body as { data: unknown }).data;
  }
  return body;
}

/** 创建一个带 envelope 解包拦截器的 axios 实例（token 由同源 httpOnly cookie 传输）。 */
export function createApiClient(baseURL?: string): AxiosInstance {
  const client = axios.create({
    baseURL: baseURL ?? "",
    timeout: 30000,
    withCredentials: true,
    headers: { "Content-Type": "application/json" },
  });

  client.interceptors.response.use(
    (response) => {
      response.data = unwrapEnvelope(response.data);
      return response;
    },
    (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        if (typeof window !== "undefined") {
          const currentPath = window.location.pathname;
          if (currentPath !== "/login" && currentPath !== "/auth/google") {
            window.location.href = "/login";
          }
        }
      }
      return Promise.reject(error);
    },
  );

  return client;
}

/** 应用全局共享的默认 axios 实例。 */
export const apiClient = createApiClient();
