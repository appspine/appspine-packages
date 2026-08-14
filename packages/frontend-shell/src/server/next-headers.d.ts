declare module "next/headers" {
  export interface CookieStore {
    get(name: string): { name: string; value: string } | undefined;
    set(
      name: string,
      value: string,
      options?: {
        path?: string;
        maxAge?: number;
        domain?: string;
        secure?: boolean;
        httpOnly?: boolean;
        sameSite?: boolean | "lax" | "strict" | "none";
      },
    ): void;
  }
  export function cookies(): Promise<CookieStore>;
}
