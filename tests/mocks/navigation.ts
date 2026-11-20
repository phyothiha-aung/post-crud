/**
 * Stateful stand-in for `next/navigation`.
 * `router.push` / `router.replace` change the URL and re-render every component
 * reading it, like the real router. Use with:
 *   vi.mock("next/navigation", () => import("<path>/mocks/navigation"));
 */
import { useMemo, useSyncExternalStore } from "react";
import { vi } from "vitest";

const ORIGIN = "http://localhost:3000";
let url = new URL("/", ORIGIN);
let params: Record<string, string> = {};
const listeners = new Set<() => void>();

const navigate = (href: string) => {
  url = new URL(href, url);
  listeners.forEach((l) => l());
};

export const router = {
  push: vi.fn(navigate),
  replace: vi.fn(navigate),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
};

/** Reset URL, route params and router spies. Call in `beforeEach`. */
export function setNavigation(
  href = "/",
  routeParams: Record<string, string> = {},
) {
  url = new URL(href, ORIGIN);
  params = routeParams;
  Object.values(router).forEach((fn) => fn.mockClear());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const useHref = () => useSyncExternalStore(subscribe, () => url.href);

export const useRouter = () => router;
export const usePathname = () => new URL(useHref()).pathname;
export function useSearchParams() {
  const href = useHref();
  return useMemo(() => new URL(href).searchParams, [href]);
}
export const useParams = () => params;
