import { apiClient } from "@qriter/web-common";

/**
 * 取一次性 WS ticket（60s）。socket.io 客户端连接前调用，把返回值放 handshake auth.token：
 *   const ticket = await fetchWsTicket();
 *   io(getBrowserApiBaseUrl() + namespace, { auth: { token: ticket } });
 * 重连 / 过期时重取。
 */
export async function fetchWsTicket(): Promise<string> {
  const { data } = await apiClient.get<{ ticket: string }>(
    "/api/auth/ws-ticket",
  );
  return data.ticket;
}
