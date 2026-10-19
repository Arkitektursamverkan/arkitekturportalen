import { apiClient } from "./client";

export interface ThemeExtractResult {
  colors: string[];
  fonts: string[];
}

export async function extractThemeFromUrl(url: string): Promise<ThemeExtractResult> {
  const { data } = await apiClient.post<ThemeExtractResult>("/theme/extract", { url });
  return data;
}
