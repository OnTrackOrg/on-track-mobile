const mockFrom = jest.fn();
const mockRpc = jest.fn();

jest.mock("./supabase", () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

import { fetchSocialGraph } from "./social";

const ME = "00000000-0000-4000-8000-0000000000aa";
const AMY = "00000000-0000-4000-8000-0000000000bb";
const BOB = "00000000-0000-4000-8000-0000000000cc";
const CAL = "00000000-0000-4000-8000-0000000000dd";
const OUT = "00000000-0000-4000-8000-0000000000ee";

// Same minimal chainable stub pattern as dataSync.test.ts: methods chain and
// record args; awaiting resolves with the next queued response.
type QueryLog = {
  table: string;
  steps: Array<{ method: string; args: unknown[] }>;
};

const setupSupabaseQueries = (
  responses: Array<{ data?: unknown; error?: unknown }>,
): QueryLog[] => {
  const log: QueryLog[] = [];
  let queryIndex = 0;

  mockFrom.mockImplementation((table: string) => {
    const entry: QueryLog = { table, steps: [] };
    log.push(entry);
    const response = responses[queryIndex++] ?? {};

    const chain: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) =>
        resolve({ data: null, error: null, ...response }),
    };
    for (const method of [
      "select",
      "in",
      "eq",
      "order",
      "insert",
      "update",
      "delete",
    ]) {
      chain[method] = (...args: unknown[]) => {
        entry.steps.push({ method, args });
        return chain;
      };
    }
    return chain;
  });

  return log;
};

describe("fetchSocialGraph", () => {
  afterEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset();
  });

  it("maps friendship rows to friends and incoming requests with requester resolution", async () => {
    const log = setupSupabaseQueries([
      {
        // friendships (RLS-scoped to rows I participate in)
        data: [
          {
            id: "f-1",
            requester_user_id: ME,
            addressee_user_id: AMY,
            status: "accepted",
            created_at: "2026-06-01T00:00:00.000Z",
          },
          {
            id: "f-2",
            requester_user_id: BOB,
            addressee_user_id: ME,
            status: "accepted",
            created_at: "2026-06-02T00:00:00.000Z",
          },
          {
            id: "f-3",
            requester_user_id: CAL,
            addressee_user_id: ME,
            status: "pending",
            created_at: "2026-07-01T00:00:00.000Z",
          },
          {
            // My own outgoing pending request: not a friend, not an
            // incoming request, but returned so Search can show "Requested".
            id: "f-4",
            requester_user_id: ME,
            addressee_user_id: OUT,
            status: "pending",
            created_at: "2026-07-02T00:00:00.000Z",
          },
        ],
      },
      {
        // public_profiles: BOB intentionally missing -> fallback profile
        data: [
          { id: AMY, username: "amy", display_name: "Amy A" },
          { id: CAL, username: "cal", display_name: "Cal C" },
        ],
      },
    ]);
    mockRpc.mockResolvedValue({ data: 3, error: null });

    const { friends, friendRequests, sentRequestUserIds } =
      await fetchSocialGraph(ME);

    // Friend id is always the OTHER side of the row, whichever column I'm in.
    expect(friends).toEqual([
      { userId: AMY, username: "amy", displayName: "Amy A" },
      { userId: BOB, username: "", displayName: "Member" },
    ]);

    expect(friendRequests).toEqual([
      {
        friendshipId: "f-3",
        requester: { userId: CAL, username: "cal", displayName: "Cal C" },
        mutualFriends: 3,
        createdAt: new Date("2026-07-01T00:00:00.000Z").getTime(),
      },
    ]);

    expect(sentRequestUserIds).toEqual([OUT]);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("mutual_friends_count", {
      other_id: CAL,
    });

    // The profile lookup covers friends + requesters, not my outgoing target.
    const profileQuery = log.find((query) => query.table === "public_profiles");
    expect(profileQuery?.steps[1]).toEqual({
      method: "in",
      args: ["id", [AMY, BOB, CAL]],
    });
  });

  it("returns empty collections when there are no friendship rows", async () => {
    const log = setupSupabaseQueries([{ data: [] }]);

    await expect(fetchSocialGraph(ME)).resolves.toEqual({
      friends: [],
      friendRequests: [],
      sentRequestUserIds: [],
    });
    // No profile ids -> no public_profiles query at all.
    expect(log.map((query) => query.table)).toEqual(["friendships"]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
