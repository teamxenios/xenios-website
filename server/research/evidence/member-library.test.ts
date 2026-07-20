import { describe, it, expect } from "vitest";
import {
  createMemberLibrary,
  type Bookmark,
  type GuideFollow,
  type GuideStatus,
  type LibraryRepository,
  type ReadReceipt,
  type TopicRequest,
} from "./member-library";

// A plain in-memory repository. `leaky` makes the per-member queries return every
// row regardless of caller, which is how a real misconfigured row-level policy
// fails. The service must still refuse to hand one member another member's rows.
function makeRepository(options: { leaky?: boolean } = {}): LibraryRepository & {
  bookmarks: Bookmark[];
  reads: ReadReceipt[];
  requests: TopicRequest[];
  follows: GuideFollow[];
  listFollowersCalls: string[];
} {
  const bookmarks: Bookmark[] = [];
  const reads: ReadReceipt[] = [];
  const requests: TopicRequest[] = [];
  const follows: GuideFollow[] = [];
  const listFollowersCalls: string[] = [];
  const leaky = options.leaky === true;

  return {
    bookmarks,
    reads,
    requests,
    follows,
    listFollowersCalls,
    async saveBookmark(bookmark) {
      bookmarks.push(bookmark);
    },
    async removeBookmark(memberId, slug) {
      for (let i = bookmarks.length - 1; i >= 0; i--) {
        if (bookmarks[i].memberId === memberId && bookmarks[i].slug === slug) bookmarks.splice(i, 1);
      }
    },
    async listBookmarks(memberId) {
      return leaky ? bookmarks.slice() : bookmarks.filter((row) => row.memberId === memberId);
    },
    async recordRead(read) {
      reads.push(read);
    },
    async listReads(memberId) {
      return leaky ? reads.slice() : reads.filter((row) => row.memberId === memberId);
    },
    async createRequest(request) {
      requests.push(request);
    },
    async listRequests() {
      return requests.slice();
    },
    async addFollower(follow) {
      follows.push(follow);
    },
    async removeFollower(memberId, slug) {
      for (let i = follows.length - 1; i >= 0; i--) {
        if (follows[i].memberId === memberId && follows[i].slug === slug) follows.splice(i, 1);
      }
    },
    async countFollowers(slug) {
      return follows.filter((row) => row.slug === slug).length;
    },
    async hasFollower(memberId, slug) {
      return follows.some((row) => row.memberId === memberId && row.slug === slug);
    },
    async listFollowers(slug) {
      listFollowersCalls.push(slug);
      return follows.filter((row) => row.slug === slug);
    },
  };
}

const STATUSES: Record<string, GuideStatus> = {
  "bpc-157": "published",
  "coming-soon-topic": "coming_soon",
  "in-review-topic": "in_review",
};

async function statusLookup(slug: string): Promise<GuideStatus | null> {
  return STATUSES[slug] ?? null;
}

const T0 = new Date("2026-01-05T10:00:00.000Z");
const T1 = new Date("2026-01-06T10:00:00.000Z");

function build(options: { leaky?: boolean } = {}) {
  const repository = makeRepository(options);
  let n = 0;
  const library = createMemberLibrary({
    repository,
    guideStatus: statusLookup,
    newId: () => `req_${++n}`,
  });
  return { repository, library };
}

describe("member library authorization", () => {
  it("returns empty for a member who saved nothing, even when the store leaks every row", async () => {
    const { library } = build({ leaky: true });

    await library.save("member-a", "bpc-157", T0);
    await library.markRead("member-a", "bpc-157", T0);

    expect(await library.listSaved("member-b")).toEqual([]);
    expect(await library.listRead("member-b")).toEqual([]);
  });

  it("never serializes another member's slug into a cross-member read", async () => {
    const { library } = build({ leaky: true });
    await library.save("member-a", "private-interest-topic", T0);

    const serialized = JSON.stringify(await library.listSaved("member-b"));
    expect(serialized).not.toContain("private-interest-topic");
    expect(serialized).not.toContain("member-a");
  });

  it("shows a member only their own topic requests", async () => {
    const { library } = build();
    await library.requestTopic("member-a", "sleep and recovery", T0);
    await library.requestTopic("member-b", "training for longevity", T0);

    const mine = await library.listOwnRequests("member-b");
    expect(mine.map((row) => row.topic)).toEqual(["training for longevity"]);
    expect(JSON.stringify(mine)).not.toContain("member-");
  });

  it("treats a blank member id as no member rather than as a wildcard", async () => {
    const { library } = build({ leaky: true });
    await library.save("member-a", "bpc-157", T0);

    expect(await library.listSaved("")).toEqual([]);
    expect(await library.listSaved("   ")).toEqual([]);
    expect(await library.listRead("")).toEqual([]);
    expect(await library.listOwnRequests("")).toEqual([]);
  });
});

describe("anonymous demand", () => {
  it("exposes a count and no identity survives serialization", async () => {
    const { library } = build();
    await library.follow("member-a", "coming-soon-topic", T0);
    await library.follow("member-b", "coming-soon-topic", T0);

    const demand = await library.demandFor("coming-soon-topic");
    expect(demand).toEqual({ followerCount: 2 });

    const serialized = JSON.stringify(demand);
    expect(serialized).toBe('{"followerCount":2}');
    expect(Object.keys(demand)).toEqual(["followerCount"]);
    expect(serialized).not.toContain("member-a");
    expect(serialized).not.toContain("member-b");
  });

  it("reports zero for a Guide nobody follows and for a blank slug", async () => {
    const { library } = build();
    expect(await library.demandFor("bpc-157")).toEqual({ followerCount: 0 });
    expect(await library.demandFor("")).toEqual({ followerCount: 0 });
  });

  it("drops a follower from the count on unfollow", async () => {
    const { library } = build();
    await library.follow("member-a", "coming-soon-topic", T0);
    await library.follow("member-b", "coming-soon-topic", T0);
    await library.unfollow("member-a", "coming-soon-topic");

    expect(await library.demandFor("coming-soon-topic")).toEqual({ followerCount: 1 });
  });

  it("aggregates topic demand without a requester identity", async () => {
    const { library } = build();
    await library.requestTopic("member-a", "sleep and recovery", T0);
    await library.requestTopic("member-b", "Sleep  and   recovery", T1);
    await library.requestTopic("member-c", "gut health", T1);

    const demand = await library.topicDemand();
    expect(demand).toEqual([
      { topic: "sleep and recovery", requestCount: 2 },
      { topic: "gut health", requestCount: 1 },
    ]);
    expect(JSON.stringify(demand)).not.toContain("member-");
  });
});

describe("unpublished Guides", () => {
  it("lets a member follow and save an unpublished Guide without revealing content", async () => {
    const { library } = build();

    await library.follow("member-a", "coming-soon-topic", T0);
    const saved = await library.save("member-a", "coming-soon-topic", T0);

    expect(saved).toEqual({
      slug: "coming-soon-topic",
      savedAt: T0.toISOString(),
      status: "coming_soon",
    });

    const list = await library.listSaved("member-a");
    expect(list).toHaveLength(1);
    expect(Object.keys(list[0]).sort()).toEqual(["savedAt", "slug", "status"]);
  });

  it("carries no body, claim, source, or excerpt key on any library shape", async () => {
    const { library } = build();
    await library.save("member-a", "in-review-topic", T0);
    await library.markRead("member-a", "in-review-topic", T1);

    const serialized = JSON.stringify({
      saved: await library.listSaved("member-a"),
      read: await library.listRead("member-a"),
    });
    ["body", "sections", "claims", "sources", "excerpt", "teaser"].forEach((forbidden) => {
      expect(serialized).not.toContain(forbidden);
    });
  });

  it("records an unknown Guide with a null status rather than inventing one", async () => {
    const { library } = build();
    const saved = await library.save("member-a", "no-such-guide", T0);
    expect(saved).toEqual({ slug: "no-such-guide", savedAt: T0.toISOString(), status: null });
  });

  it("keeps a member's library readable when the status lookup fails", async () => {
    const repository = makeRepository();
    const library = createMemberLibrary({
      repository,
      guideStatus: async () => {
        throw new Error("status service down");
      },
    });
    await library.save("member-a", "bpc-157", T0);
    expect(await library.listSaved("member-a")).toEqual([
      { slug: "bpc-157", savedAt: T0.toISOString(), status: null },
    ]);
  });
});

describe("saving and reading", () => {
  it("is idempotent on a duplicate save and keeps the original timestamp", async () => {
    const { repository, library } = build();

    const first = await library.save("member-a", "bpc-157", T0);
    const second = await library.save("member-a", "bpc-157", T1);

    expect(first?.savedAt).toBe(T0.toISOString());
    expect(second?.savedAt).toBe(T0.toISOString());
    expect(repository.bookmarks).toHaveLength(1);
    expect(await library.listSaved("member-a")).toHaveLength(1);
  });

  it("is idempotent on a duplicate follow", async () => {
    const { repository, library } = build();
    await library.follow("member-a", "coming-soon-topic", T0);
    await library.follow("member-a", "coming-soon-topic", T1);

    expect(repository.follows).toHaveLength(1);
    expect(await library.demandFor("coming-soon-topic")).toEqual({ followerCount: 1 });
  });

  it("removes only the caller's own bookmark", async () => {
    const { repository, library } = build();
    await library.save("member-a", "bpc-157", T0);
    await library.save("member-b", "bpc-157", T0);

    await library.unsave("member-b", "bpc-157");

    expect(repository.bookmarks.map((row) => row.memberId)).toEqual(["member-a"]);
  });

  it("uses the injected clock for every timestamp", async () => {
    const { library } = build();
    await library.save("member-a", "bpc-157", T0);
    await library.markRead("member-a", "bpc-157", T1);

    const read = await library.listRead("member-a");
    expect(read[0].readAt).toBe(T1.toISOString());
  });

  it("ignores a save or a read with a blank slug", async () => {
    const { repository, library } = build();
    expect(await library.save("member-a", "  ", T0)).toBeNull();
    await library.markRead("member-a", "", T0);

    expect(repository.bookmarks).toHaveLength(0);
    expect(repository.reads).toHaveLength(0);
  });
});

describe("topic requests", () => {
  it("stores the member id but returns only the request to its author", async () => {
    const { repository, library } = build();
    const result = await library.requestTopic("member-a", "recovery after travel", T0);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.request).toEqual({
        id: "req_1",
        topic: "recovery after travel",
        requestedAt: T0.toISOString(),
      });
      expect(JSON.stringify(result.request)).not.toContain("member-a");
    }
    expect(repository.requests[0].memberId).toBe("member-a");
  });

  it("refuses a topic that states a unit, a frequency, or a route", async () => {
    const { repository, library } = build();
    const refused = [
      "how much 500 mg per day",
      "best dosing schedule",
      "take it twice daily",
      "subcutaneous versus oral routes",
      "how to titrate over a loading phase",
    ];

    for (let i = 0; i < refused.length; i++) {
      const result = await library.requestTopic("member-a", refused[i], T0);
      expect(result).toEqual({ ok: false, code: "topic_not_allowed" });
    }
    expect(repository.requests).toHaveLength(0);
  });

  it("refuses a route, a dose form, or an administration instruction the old filter missed", async () => {
    // Regression: these all passed the original pattern set.
    const { repository, library } = build();
    const refused = [
      "oral route versus topical route",
      "how many capsules are typical",
      "taking it every 8 hours",
      "3 times per week versus daily",
      "intravenous versus transdermal delivery",
      "is a loading dose needed",
      "should it be taken with food",
      "what about a washout between cycles",
      "500 units before bed",
    ];

    for (let i = 0; i < refused.length; i++) {
      const result = await library.requestTopic("member-a", refused[i], T0);
      expect(result, refused[i]).toEqual({ ok: false, code: "topic_not_allowed" });
    }
    expect(repository.requests).toHaveLength(0);
  });

  it("still accepts an ordinary research topic", async () => {
    const { library } = build();
    const allowed = ["sleep and recovery", "gut health", "oral health", "training for longevity"];
    for (let i = 0; i < allowed.length; i++) {
      const result = await library.requestTopic("member-a", allowed[i], T0);
      expect(result.ok, allowed[i]).toBe(true);
    }
  });

  it("refuses a blank or over-long topic", async () => {
    const { library } = build();
    expect(await library.requestTopic("member-a", "   ", T0)).toEqual({ ok: false, code: "topic_invalid" });
    expect(await library.requestTopic("member-a", "x".repeat(181), T0)).toEqual({
      ok: false,
      code: "topic_invalid",
    });
    expect(await library.requestTopic("", "sleep", T0)).toEqual({ ok: false, code: "topic_invalid" });
  });
});

describe("notification path", () => {
  it("keeps follower ids off the member surface and only under internal", async () => {
    const { library } = build();
    await library.follow("member-a", "coming-soon-topic", T0);
    await library.follow("member-b", "coming-soon-topic", T1);

    expect(await library.internal.pendingNotifications("coming-soon-topic")).toEqual([
      "member-a",
      "member-b",
    ]);

    const memberSurface = Object.keys(library).filter((key) => key !== "internal");
    expect(memberSurface).not.toContain("pendingNotifications");
    expect(JSON.stringify(await library.demandFor("coming-soon-topic"))).not.toContain("member-");
  });

  it("never reads the follower list from a member-facing method", async () => {
    // Regression: `follow` used to call listFollowers for its idempotency check,
    // which put every other follower's member id in scope inside a member call.
    const { repository, library } = build();
    await library.follow("member-a", "coming-soon-topic", T0);
    await library.follow("member-b", "coming-soon-topic", T1);
    await library.follow("member-b", "coming-soon-topic", T1);
    await library.unfollow("member-a", "coming-soon-topic");
    await library.save("member-b", "coming-soon-topic", T0);
    await library.listSaved("member-b");
    await library.listRead("member-b");
    await library.listOwnRequests("member-b");
    await library.demandFor("coming-soon-topic");
    await library.topicDemand();

    expect(repository.listFollowersCalls).toEqual([]);

    // The idempotency the old implementation bought with that read still holds.
    expect(repository.follows).toHaveLength(1);
    await library.internal.pendingNotifications("coming-soon-topic");
    expect(repository.listFollowersCalls).toEqual(["coming-soon-topic"]);
  });

  it("returns an empty notification list for an unfollowed or blank slug", async () => {
    const { library } = build();
    expect(await library.internal.pendingNotifications("bpc-157")).toEqual([]);
    expect(await library.internal.pendingNotifications("")).toEqual([]);
  });
});
