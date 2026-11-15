import { describe, expect, it, vi } from 'vitest';

const { precacheAndRoute, createHandlerBoundToURL, registerRoute, NavigationRoute } = vi.hoisted(() => ({
  precacheAndRoute: vi.fn(),
  createHandlerBoundToURL: vi.fn((url: string) => ({ boundTo: url })),
  registerRoute: vi.fn(),
  NavigationRoute: vi.fn(function (this: Record<string, unknown>, handler: unknown, opts: unknown) { this.handler = handler; this.opts = opts; }),
}));
vi.mock('workbox-precaching', () => ({ precacheAndRoute, createHandlerBoundToURL }));
vi.mock('workbox-routing', () => ({ registerRoute, NavigationRoute }));

describe('service worker', () => {
  it('serves the app shell for every in-app navigation, so deep links work offline', async () => {
    (globalThis as unknown as { __WB_MANIFEST: unknown[] }).__WB_MANIFEST = [{ url: '/index.html', revision: '1' }];
    await import('./sw');
    expect(precacheAndRoute).toHaveBeenCalled();
    expect(createHandlerBoundToURL).toHaveBeenCalledWith('/index.html');
    expect(registerRoute).toHaveBeenCalledTimes(1);
    const route = registerRoute.mock.calls[0][0] as { handler: unknown; opts: { denylist: RegExp[] } };
    expect(route).toBeInstanceOf(NavigationRoute);
    expect(route.handler).toEqual({ boundTo: '/index.html' });
    // Firebase's reserved /__/ paths (auth handler, hosting config) must reach the network.
    expect(route.opts.denylist.some((r) => r.test('/__/auth/handler'))).toBe(true);
    expect(route.opts.denylist.some((r) => r.test('/team/t1/invoices'))).toBe(false);
  });
});
