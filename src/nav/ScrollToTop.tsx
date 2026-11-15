import { useEffect } from 'react';
import { useLocation } from 'react-router';

/** Every new page starts at the top (the browser otherwise keeps the previous page's scroll position). */
export default function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}
