import { describe, expect, it } from "vitest";
import { dateHeading, groupByDate } from "@/lib/dateGroups";

// A Thursday afternoon.
const TODAY = new Date(2026, 10, 26, 15, 30);

describe("dateHeading", () => {
  it("names today and yesterday", () => {
    expect(dateHeading("2026-11-26", TODAY)).toBe("Today");
    expect(dateHeading("2026-11-25", TODAY)).toBe("Yesterday");
  });

  it("shows the weekday and date for other days this year", () => {
    expect(dateHeading("2026-11-24", TODAY)).toBe("Tue, Nov 24");
    expect(dateHeading("2026-01-02", TODAY)).toBe("Fri, Jan 2");
  });

  it("adds the year for other years", () => {
    expect(dateHeading("2025-12-31", TODAY)).toBe("Wed, Dec 31, 2025");
  });

  it("counts calendar days across a daylight saving change", () => {
    const afterChange = new Date(2026, 10, 2, 0, 30);
    expect(dateHeading("2026-11-01", afterChange)).toBe("Yesterday");
  });

  it("returns anything that isn't a date as it is", () => {
    expect(dateHeading("pending", TODAY)).toBe("pending");
  });
});

describe("groupByDate", () => {
  it("groups consecutive items by day and keeps the order", () => {
    const items = [
      { id: "a", date: "2026-11-26" },
      { id: "b", date: "2026-11-26" },
      { id: "c", date: "2026-11-24" },
      { id: "d", date: "2026-11-20" },
      { id: "e", date: "2026-11-20" },
    ];
    expect(groupByDate(items).map((group) => [group.date, group.items.map((item) => item.id)])).toEqual([
      ["2026-11-26", ["a", "b"]],
      ["2026-11-24", ["c"]],
      ["2026-11-20", ["d", "e"]],
    ]);
  });

  it("returns no groups for no items", () => {
    expect(groupByDate([])).toEqual([]);
  });
});
