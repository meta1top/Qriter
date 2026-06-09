import type { NextRequest } from "next/server";
import { proxyAndSetCookie } from "@/lib/auth-cookie";

export async function POST(req: NextRequest) {
  return proxyAndSetCookie("/api/auth/github", await req.json());
}
