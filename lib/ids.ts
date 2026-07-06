/**
 * UUID helpers shared by the store and the sync layer. Every goal/task id is
 * a real UUID from birth (store.makeId) so local ids are always
 * server-compatible and never need remapping at sync or invite time.
 */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

export const makeUuid = (): string => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  /**
   * Fallback for environments where `crypto.randomUUID()` is unavailable.
   * This keeps id generation working in tests and older runtimes.
   */
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const randomNibble = Math.floor(Math.random() * 16);
      const value =
        character === "x" ? randomNibble : (randomNibble & 0x3) | 0x8;
      return value.toString(16);
    },
  );
};
