declare module 'next/navigation' {
  export interface AppRouterInstance {
    back(): void;
    forward(): void;
    refresh(): void;
    push(href: string): void;
    replace(href: string): void;
    prefetch(href: string): void;
  }

  export function usePathname(): string;
  export function useRouter(): AppRouterInstance;
  export function redirect(url: string, type?: 'replace' | 'push'): never;
  export function notFound(): never;
}
