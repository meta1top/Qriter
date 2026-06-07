import { clearAuthCookie } from "@/lib/auth-cookie";

export async function POST() {
  return clearAuthCookie();
}
