import { describe, it, expect } from "vitest";
import {
  extractMentionIds,
  hasEveryoneMention,
  stripEveryone,
  storageToDisplay,
  displayToStorage,
  rebuildMappings,
  sanitizeOrphanedZwj,
  type MentionMapping,
} from "@/lib/mention-utils";

const ZWJ = "\u200D";
const uuid1 = "4bed9087-f506-4ffd-9e0c-7347906629f3";
const uuid2 = "32e61f10-5d29-40a2-adea-1d2894fea6d4";
const uuid3 = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

// ─── extractMentionIds ───────────────────────────────────────────────────

describe("extractMentionIds", () => {
  it("extracts single mention", () => {
    expect(extractMentionIds(`Hello @[James](${uuid1})`)).toEqual([uuid1]);
  });

  it("extracts multiple unique mentions", () => {
    const text = `@[Alice](${uuid1}) and @[Bob](${uuid2}) and @[Alice](${uuid1})`;
    expect(extractMentionIds(text)).toEqual([uuid1, uuid2]);
  });

  it("returns empty for no mentions", () => {
    expect(extractMentionIds("Hello world")).toEqual([]);
  });

  it("ignores malformed mentions", () => {
    expect(extractMentionIds("@[Name](not-a-uuid)")).toEqual([]);
    expect(extractMentionIds("@Name")).toEqual([]);
  });
});

// ─── hasEveryoneMention / stripEveryone ──────────────────────────────────

describe("hasEveryoneMention", () => {
  it("detects @everyone", () => {
    expect(hasEveryoneMention("Hello @everyone!")).toBe(true);
    expect(hasEveryoneMention("Hello @Everyone")).toBe(true);
  });

  it("returns false when absent", () => {
    expect(hasEveryoneMention("Hello everyone")).toBe(false);
  });
});

describe("stripEveryone", () => {
  it("removes @ prefix", () => {
    expect(stripEveryone("Hi @everyone and @Everyone")).toBe("Hi everyone and everyone");
  });
});

// ─── storageToDisplay ────────────────────────────────────────────────────

describe("storageToDisplay", () => {
  it("converts single mention to ZWJ display format", () => {
    const { display, mappings } = storageToDisplay(`Hello @[James Fuentes](${uuid1})!`);
    expect(display).toBe(`Hello @${ZWJ}James Fuentes${ZWJ}!`);
    expect(mappings).toEqual([{ displayName: "James Fuentes", userId: uuid1 }]);
  });

  it("handles multiple mentions including duplicate names", () => {
    const text = `@[Alice](${uuid1}) and @[Alice](${uuid2})`;
    const { display, mappings } = storageToDisplay(text);
    expect(display).toBe(`@${ZWJ}Alice${ZWJ} and @${ZWJ}Alice${ZWJ}`);
    expect(mappings).toHaveLength(2);
    expect(mappings[0].userId).toBe(uuid1);
    expect(mappings[1].userId).toBe(uuid2);
  });

  it("handles same user mentioned twice", () => {
    const text = `@[James](${uuid1}) said hi to @[James](${uuid1})`;
    const { display, mappings } = storageToDisplay(text);
    expect(mappings).toHaveLength(2);
    expect(mappings[0].userId).toBe(uuid1);
    expect(mappings[1].userId).toBe(uuid1);
    expect(display).toContain(`@${ZWJ}James${ZWJ}`);
  });

  it("preserves @everyone as-is", () => {
    const { display } = storageToDisplay("Hi @everyone");
    expect(display).toBe("Hi @everyone");
  });

  it("handles empty string", () => {
    const { display, mappings } = storageToDisplay("");
    expect(display).toBe("");
    expect(mappings).toEqual([]);
  });

  it("handles text with no mentions", () => {
    const { display, mappings } = storageToDisplay("Just plain text");
    expect(display).toBe("Just plain text");
    expect(mappings).toEqual([]);
  });
});

// ─── displayToStorage ────────────────────────────────────────────────────

describe("displayToStorage", () => {
  it("converts ZWJ display mention back to storage format", () => {
    const display = `Hello @${ZWJ}James Fuentes${ZWJ}!`;
    const mappings: MentionMapping[] = [{ displayName: "James Fuentes", userId: uuid1 }];
    expect(displayToStorage(display, mappings)).toBe(`Hello @[James Fuentes](${uuid1})!`);
  });

  it("handles duplicate display names with ordered consumption", () => {
    const display = `@${ZWJ}Alice${ZWJ} and @${ZWJ}Alice${ZWJ}`;
    const mappings: MentionMapping[] = [
      { displayName: "Alice", userId: uuid1 },
      { displayName: "Alice", userId: uuid2 },
    ];
    const result = displayToStorage(display, mappings);
    expect(result).toBe(`@[Alice](${uuid1}) and @[Alice](${uuid2})`);
  });

  it("falls back to plain @Name when mapping is missing", () => {
    const display = `@${ZWJ}Unknown Person${ZWJ}`;
    expect(displayToStorage(display, [])).toBe("@Unknown Person");
  });

  it("cleans orphaned ZWJ from text without valid mentions", () => {
    const display = `Hello${ZWJ} world`;
    expect(displayToStorage(display, [])).toBe("Hello world");
  });

  it("handles mixed mentions and @everyone", () => {
    const display = `@${ZWJ}James${ZWJ} and @everyone`;
    const mappings: MentionMapping[] = [{ displayName: "James", userId: uuid1 }];
    const result = displayToStorage(display, mappings);
    expect(result).toBe(`@[James](${uuid1}) and @everyone`);
  });

  it("handles empty string", () => {
    expect(displayToStorage("", [])).toBe("");
  });
});

// ─── rebuildMappings ─────────────────────────────────────────────────────

describe("rebuildMappings", () => {
  it("keeps mappings for intact mentions", () => {
    const display = `@${ZWJ}James${ZWJ} hello`;
    const mappings: MentionMapping[] = [{ displayName: "James", userId: uuid1 }];
    expect(rebuildMappings(display, mappings)).toEqual(mappings);
  });

  it("drops mappings when mention is deleted", () => {
    const display = "hello"; // mention was removed
    const mappings: MentionMapping[] = [{ displayName: "James", userId: uuid1 }];
    expect(rebuildMappings(display, mappings)).toEqual([]);
  });

  it("drops mapping when ZWJ boundary is broken (partial delete)", () => {
    // User deleted the trailing ZWJ — mention structure broken
    const display = `@${ZWJ}Jame`;
    const mappings: MentionMapping[] = [{ displayName: "James", userId: uuid1 }];
    expect(rebuildMappings(display, mappings)).toEqual([]);
  });

  it("handles removing one of two duplicate-name mentions", () => {
    // Two "Alice" mentions, user deletes the first one
    const display = `text @${ZWJ}Alice${ZWJ}`;
    const mappings: MentionMapping[] = [
      { displayName: "Alice", userId: uuid1 },
      { displayName: "Alice", userId: uuid2 },
    ];
    const result = rebuildMappings(display, mappings);
    // Should consume the first available mapping
    expect(result).toEqual([{ displayName: "Alice", userId: uuid1 }]);
  });

  it("handles multiple mentions with one removed", () => {
    const display = `@${ZWJ}Alice${ZWJ} and @${ZWJ}Charlie${ZWJ}`;
    const mappings: MentionMapping[] = [
      { displayName: "Alice", userId: uuid1 },
      { displayName: "Bob", userId: uuid2 },
      { displayName: "Charlie", userId: uuid3 },
    ];
    const result = rebuildMappings(display, mappings);
    expect(result).toEqual([
      { displayName: "Alice", userId: uuid1 },
      { displayName: "Charlie", userId: uuid3 },
    ]);
  });

  it("returns empty for text with no ZWJ mentions", () => {
    expect(rebuildMappings("plain text @Name", [{ displayName: "Name", userId: uuid1 }])).toEqual([]);
  });
});

// ─── sanitizeOrphanedZwj ─────────────────────────────────────────────────

describe("sanitizeOrphanedZwj", () => {
  it("removes orphaned ZWJ while preserving valid mentions", () => {
    const text = `orphan${ZWJ}text @${ZWJ}James${ZWJ} more${ZWJ}orphans`;
    const result = sanitizeOrphanedZwj(text);
    expect(result).toBe(`orphantext @${ZWJ}James${ZWJ} moreorphans`);
  });

  it("passes through text with no ZWJ", () => {
    expect(sanitizeOrphanedZwj("Hello world")).toBe("Hello world");
  });

  it("removes all ZWJ when no valid mentions exist", () => {
    expect(sanitizeOrphanedZwj(`a${ZWJ}b${ZWJ}c`)).toBe("abc");
  });

  it("preserves multiple valid mentions", () => {
    const text = `@${ZWJ}A${ZWJ} and @${ZWJ}B${ZWJ}`;
    expect(sanitizeOrphanedZwj(text)).toBe(text);
  });
});

// ─── Round-trip tests ────────────────────────────────────────────────────

describe("round-trip: storage → display → storage", () => {
  it("preserves single mention", () => {
    const original = `Hello @[James Fuentes](${uuid1})!`;
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });

  it("preserves multiple mentions", () => {
    const original = `@[Alice](${uuid1}) cc @[Bob](${uuid2})`;
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });

  it("preserves duplicate names", () => {
    const original = `@[Alice](${uuid1}) and @[Alice](${uuid2})`;
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });

  it("preserves same user mentioned twice", () => {
    const original = `@[James](${uuid1}) to @[James](${uuid1})`;
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });

  it("preserves mixed mentions and @everyone", () => {
    const original = `@[James](${uuid1}) and @everyone`;
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });

  it("preserves text with no mentions", () => {
    const original = "Just plain text with @ symbol";
    const { display, mappings } = storageToDisplay(original);
    expect(displayToStorage(display, mappings)).toBe(original);
  });
});

// ─── Simulated editing scenarios ─────────────────────────────────────────

describe("editing simulation", () => {
  it("handles inserting a mention then deleting it", () => {
    // Start: user types "Hello " then selects James
    const { display: d1, mappings: m1 } = storageToDisplay("");
    const afterInsert = `Hello @${ZWJ}James${ZWJ} `;
    const mappingsAfterInsert: MentionMapping[] = [{ displayName: "James", userId: uuid1 }];

    // Verify storage
    const storage1 = displayToStorage(afterInsert, mappingsAfterInsert);
    expect(storage1).toBe(`Hello @[James](${uuid1}) `);

    // User deletes the mention (backspace over it)
    const afterDelete = "Hello ";
    const mappingsAfterDelete = rebuildMappings(afterDelete, mappingsAfterInsert);
    expect(mappingsAfterDelete).toEqual([]);
    expect(displayToStorage(afterDelete, mappingsAfterDelete)).toBe("Hello ");
  });

  it("handles adding text between two mentions", () => {
    const original = `@[Alice](${uuid1}) @[Bob](${uuid2})`;
    const { display, mappings } = storageToDisplay(original);

    // User types " and " between the two mentions
    const edited = display.replace(
      `${ZWJ} @`,
      `${ZWJ} and @`
    );
    const newMappings = rebuildMappings(edited, mappings);
    expect(newMappings).toHaveLength(2);
    const result = displayToStorage(edited, newMappings);
    expect(result).toBe(`@[Alice](${uuid1}) and @[Bob](${uuid2})`);
  });

  it("handles pasting plain text with @ that isn't a mention", () => {
    const display = `Hello @someone plain`;
    const mappings: MentionMapping[] = [];
    // No ZWJ markers → no mention conversion
    expect(displayToStorage(display, mappings)).toBe("Hello @someone plain");
  });
});
