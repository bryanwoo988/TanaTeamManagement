/**
 * The in-app paths notifications open (in-app list and Web Push). The server builds every
 * notification url with these, and src/routes.test.tsx checks each one lands on a real page.
 */
export const notifyUrl = {
  /** Calendar, optionally showing a team's layer and a date. */
  calendar: (teamId?: string, date?: string): string => {
    const q = [teamId && `team=${teamId}`, date && `date=${date}`].filter(Boolean).join('&');
    return q ? `/?${q}` : '/';
  },
  members: (teamId: string): string => `/team/${teamId}/members`,
  invoice: (teamId: string, invoiceId: string): string => `/team/${teamId}/invoices/${invoiceId}`,
};
