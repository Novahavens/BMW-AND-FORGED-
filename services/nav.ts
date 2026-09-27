/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Client-side navigation for plain links (footer, info pages): App re-reads the route on popstate. */
export function goTo(path: string) {
  if (window.location.pathname === path) return;
  try {
    window.history.pushState({}, '', path);
  } catch {
    window.location.hash = `#${path}`;
    return;
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** onClick for an <a href>: navigate in-app on a normal click, let modified clicks open a new tab. */
export const linkTo = (path: string) => (e: { preventDefault: () => void; metaKey?: boolean; ctrlKey?: boolean; shiftKey?: boolean }) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  goTo(path);
};
