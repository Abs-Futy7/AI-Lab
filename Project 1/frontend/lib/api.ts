import axios from "axios";

import type { CompareResponse, ComparisonRequest, RouteRequest, SearchResult } from "@/types/routing";

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000",
  timeout: 120_000,
});

export async function findRoute(request: RouteRequest): Promise<SearchResult> {
  const { data } = await client.post<SearchResult>("/api/route", request);
  return data;
}

export async function compareRoutes(
  request: ComparisonRequest,
): Promise<CompareResponse> {
  const { data } = await client.post<CompareResponse>("/api/compare", request);
  return data;
}

export function readableApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    if (error.code === "ECONNABORTED") return "The routing request timed out.";
    if (!error.response) return "Cannot reach the backend at port 8000.";
  }
  return "The routing request could not be completed.";
}
