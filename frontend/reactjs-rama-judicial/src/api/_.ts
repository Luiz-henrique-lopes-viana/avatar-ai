const BASE_URL = import.meta.env.VITE_BACKEND_URL;
const ENVIRONMENT = import.meta.env.VITE_ENVIRONMENT;

export interface AppFetchParams {
  params?: Record<string, string>;
  options?: RequestInit;
}

export type AppFetchError = {
  error: string;
};

export const appFetch = async (
  endpoint: string,
  { params, options }: AppFetchParams = {}
) => {
  const headers = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  const url_params = params ? `?${new URLSearchParams(params)}` : "";
  const url = `${BASE_URL}${endpoint}${url_params}`;

  ENVIRONMENT === "dev" &&
    console.log(`[${options?.method || "GET"}] Request URL:`, url);

  try {
    const response = await fetch(url, { ...options, headers });
    const data = await response.json();

    if (data && data.error) {
      return { error: data.error };
    }

    return data;
  } catch (error: any) {
    return { error: error.message || "Erro durante a requisição" };
  }
};
