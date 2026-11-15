import type { NotifyKind } from '../../shared/types';

export interface Notification {
  kind: NotifyKind;
  teamId?: string;
  refId?: string;
  vars: Record<string, string | number>;
  url: string;
}

/** Placeholder: Task 11 implements delivery (in-app inbox + web push). Final signature. */
export async function notifyUsers(_uids: string[], _n: Notification, _opts?: { exclude?: string }): Promise<void> {}
