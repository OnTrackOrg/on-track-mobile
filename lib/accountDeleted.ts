// ponytail: module-level callback instead of a context — one producer
// (ProfileScreen's delete-account flow) and one consumer (App's gate).
let handler: (() => void) | null = null;

export const setAccountDeletedHandler = (next: (() => void) | null): void => {
  handler = next;
};

export const notifyAccountDeleted = (): void => {
  handler?.();
};
