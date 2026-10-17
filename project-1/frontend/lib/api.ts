import axios from "axios";

import type { CompareResponse, ComparisonRequest, RouteRequest, SearchResult } from "@/types/routing";
import type { CSPAlgorithm, Lab2Comparison, Lab2GenerateRequest, Lab2Result, Lab2Scenario } from "@/types/lab2";

const client = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "",
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

export async function generateLab2Scenario(request: Lab2GenerateRequest): Promise<Lab2Scenario> {
  const { data } = await client.post<Lab2Scenario>("/api/lab2/scenario/generate", request);
  return data;
}

export async function solveLab2Scenario(
  scenario: Lab2Scenario,
  algorithm: CSPAlgorithm,
): Promise<Lab2Result> {
  const { data } = await client.post<Lab2Result>("/api/lab2/solve", {
    scenario_id: scenario.scenario_id,
    scenario: { ...scenario, id: scenario.scenario_id },
    algorithm, debug: true, local_search_max_steps: 3000,
  });
  return data;
}

export async function compareLab2Scenario(scenario: Lab2Scenario): Promise<Lab2Comparison> {
  const { data } = await client.post<Lab2Comparison>("/api/lab2/compare", {
    scenario_id: scenario.scenario_id,
    scenario: { ...scenario, id: scenario.scenario_id },
    debug: true, local_search_max_steps: 3000,
  });
  return data;
}

export function readableApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg;
    if (error.code === "ECONNABORTED") return "The routing request timed out.";
    if (!error.response) return "Cannot reach the routing backend.";
  }
  return "The routing request could not be completed.";
}
