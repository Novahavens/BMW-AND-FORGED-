/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** History state of an entry the app pushed itself: the entry before it is a page of this app. */
export const IN_APP_STATE = { fromApp: true } as const;

/** True when the browser's Back goes to a page of this app (not to another site, or out of a new tab). */
export const cameFromApp = () => {
  try {
    return window.history.state?.fromApp === true;
  } catch {
    return false;
  }
};

/** Client-side navigation for plain links (footer, info pages): App re-reads the route on popstate. */
export function goTo(path: string) {
  if (window.location.pathname === path) return;
  try {
    window.history.pushState(IN_APP_STATE, '', path);
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
