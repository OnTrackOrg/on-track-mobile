const mockRemote: { avatar_uri: string | null } = { avatar_uri: null };
const mockUpdates: { avatar_uri: string }[] = [];

jest.mock("./supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { ...mockRemote }, error: null }),
        }),
      }),
      update: (row: { avatar_uri: string }) => ({
        eq: async () => {
          mockUpdates.push(row);
          mockRemote.avatar_uri = row.avatar_uri;
          return { error: null };
        },
      }),
    }),
  },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearMyAvatar,
  reconcileAvatarWithProfile,
  saveMyAvatar,
  useMyAvatar,
} from "./avatar";
import { STORAGE_KEYS } from "./persistence";

const ME = "00000000-0000-4000-8000-00000000000a";

beforeEach(async () => {
  await AsyncStorage.clear();
  mockRemote.avatar_uri = null;
  mockUpdates.length = 0;
  useMyAvatar.setState({ uri: null });
});

describe("my avatar", () => {
  it("adopts the profile photo when it differs from the device copy", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.avatar, "data:old");
    mockRemote.avatar_uri = "data:new-from-other-device";

    await reconcileAvatarWithProfile(ME);

    expect(useMyAvatar.getState().uri).toBe("data:new-from-other-device");
    expect(await AsyncStorage.getItem(STORAGE_KEYS.avatar)).toBe(
      "data:new-from-other-device",
    );
    expect(mockUpdates).toEqual([]);
  });

  it("drops a leftover photo when the profile has none", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.avatar, "data:previous-account");

    await reconcileAvatarWithProfile(ME);

    expect(useMyAvatar.getState().uri).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.avatar)).toBeNull();
    expect(mockUpdates).toEqual([]);
  });

  it("uploads a pick that never reached the profile", async () => {
    await saveMyAvatar("data:offline-pick", null); // no user yet: stays pending
    mockRemote.avatar_uri = "data:older";

    await reconcileAvatarWithProfile(ME);

    expect(mockUpdates).toEqual([{ avatar_uri: "data:offline-pick" }]);
    expect(useMyAvatar.getState().uri).toBe("data:offline-pick");
    expect(
      await AsyncStorage.getItem(STORAGE_KEYS.avatarPendingUpload),
    ).toBeNull();
  });

  it("shows a new pick everywhere at once and publishes it", async () => {
    await saveMyAvatar("data:picked", ME);

    expect(useMyAvatar.getState().uri).toBe("data:picked");
    expect(mockUpdates).toEqual([{ avatar_uri: "data:picked" }]);
    expect(
      await AsyncStorage.getItem(STORAGE_KEYS.avatarPendingUpload),
    ).toBeNull();
  });

  it("forgets the photo on sign-out", async () => {
    await saveMyAvatar("data:picked", ME);
    await clearMyAvatar();

    expect(useMyAvatar.getState().uri).toBeNull();
    expect(await AsyncStorage.getItem(STORAGE_KEYS.avatar)).toBeNull();
  });
});
