import { describe, expect, it, vi } from 'vitest';
import { matchRoutes } from 'react-router';

vi.mock('./firebase', () => ({ auth: {}, db: {}, storage: {}, functions: {} }));

import { routes } from './routes';
import { notifyUrl } from '../shared/notifyUrls';

/** The deepest route a path lands on ('' for the index route). */
const landsOn = (url: string) => {
  const m = matchRoutes(routes, new URL(url, 'https://app.test').pathname);
  const last = m?.[m.length - 1]?.route as { path?: string; index?: boolean } | undefined;
  return last ? (last.index ? '' : last.path) : undefined;
};

describe('routes', () => {
  it('every notification url the server builds opens a real page', () => {
    const urls = [
      notifyUrl.calendar(), notifyUrl.calendar('t1'), notifyUrl.calendar(undefined, '2026-11-20'), notifyUrl.calendar('t1', '2026-11-20'),
      notifyUrl.members('t1'), notifyUrl.invoice('t1', 'i1'),
    ];
    for (const u of urls) {
      const r = landsOn(u);
      expect(r, u).toBeDefined();
      expect(r, u).not.toBe('*');
    }
    expect(notifyUrl.calendar('t1')).toBe('/?team=t1');
    expect(notifyUrl.calendar('t1', '2026-11-20')).toBe('/?team=t1&date=2026-11-20');
  });

  it('an unknown path falls back to a redirect home instead of a 404', () => {
    expect(landsOn('/team/t1')).toBe('*');
    expect(landsOn('/no/such/page')).toBe('*');
  });
});
