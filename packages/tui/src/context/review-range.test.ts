import { describe, it, expect } from "bun:test";
import { pickCommentForRange, type CommentWithNote } from "./review";

function c(
  input: Partial<CommentWithNote> & {
    id: number;
    file: string;
    patchId: number;
    startRow: number;
    endRow: number;
    createdAt: number;
  },
): CommentWithNote {
  return {
    id: input.id,
    reviewId: input.reviewId ?? 1,
    noteId: input.noteId ?? 1,
    file: input.file,
    patchId: input.patchId,
    startRow: input.startRow,
    endRow: input.endRow,
    createdAt: input.createdAt,
    notePath: input.notePath ?? null,
    noteContent: input.noteContent ?? null,
  };
}

describe("pickCommentForRange", () => {
  it("prefers exact patch match when available", () => {
    const list = [
      c({
        id: 1,
        file: "a.ts",
        patchId: 10,
        startRow: 3,
        endRow: 5,
        createdAt: 100,
      }),
      c({
        id: 2,
        file: "a.ts",
        patchId: 11,
        startRow: 3,
        endRow: 5,
        createdAt: 200,
      }),
    ];

    expect(pickCommentForRange(list, 10, "a.ts", 3, 5)?.id).toBe(1);
  });

  it("falls back to newest range match when patch is unknown", () => {
    const list = [
      c({
        id: 1,
        file: "a.ts",
        patchId: 10,
        startRow: 3,
        endRow: 5,
        createdAt: 100,
      }),
      c({
        id: 2,
        file: "a.ts",
        patchId: 11,
        startRow: 3,
        endRow: 5,
        createdAt: 200,
      }),
    ];

    expect(pickCommentForRange(list, null, "a.ts", 3, 5)?.id).toBe(2);
  });

  it("falls back to newest range match when preferred patch has no exact match", () => {
    const list = [
      c({
        id: 1,
        file: "a.ts",
        patchId: 10,
        startRow: 3,
        endRow: 5,
        createdAt: 100,
      }),
      c({
        id: 2,
        file: "a.ts",
        patchId: 11,
        startRow: 3,
        endRow: 5,
        createdAt: 200,
      }),
    ];

    expect(pickCommentForRange(list, 999, "a.ts", 3, 5)?.id).toBe(2);
  });

  it("returns null when there is no match", () => {
    const list = [
      c({
        id: 1,
        file: "a.ts",
        patchId: 10,
        startRow: 1,
        endRow: 1,
        createdAt: 100,
      }),
    ];

    expect(pickCommentForRange(list, null, "a.ts", 3, 5)).toBe(null);
  });
});
