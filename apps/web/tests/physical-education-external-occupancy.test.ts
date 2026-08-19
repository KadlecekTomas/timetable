import assert from "node:assert/strict";
import test from "node:test";

import {
  loadPhysicalEducationExternalOccupancy,
  schoolDefaultPhysicalEducationExternalOccupancySlots,
  schoolRecommendedPhysicalEducationExternalOccupancySlots,
} from "../lib/local/physical-education-external-occupancy";

function key(dayOfWeek: number, period: number): string {
  return `${dayOfWeek}:${period}`;
}

test("fresh projects preserve the original PE occupancy until recommendation is applied", () => {
  assert.deepEqual(
    loadPhysicalEducationExternalOccupancy().slots,
    schoolDefaultPhysicalEducationExternalOccupancySlots(),
  );
});

test("recommended PE profile frees exactly nine room-periods against original input", () => {
  const original = new Map(
    schoolDefaultPhysicalEducationExternalOccupancySlots().map((slot) => [
      key(slot.dayOfWeek, slot.period),
      slot.occupiedSpaces,
    ]),
  );
  const recommended = schoolRecommendedPhysicalEducationExternalOccupancySlots();

  assert.equal(recommended.length, original.size);
  const freed = recommended.reduce(
    (sum, slot) =>
      sum +
      ((original.get(key(slot.dayOfWeek, slot.period)) ?? 0) -
        slot.occupiedSpaces),
    0,
  );
  assert.equal(freed, 9);

  for (const slot of recommended) {
    const wasOccupied = original.get(key(slot.dayOfWeek, slot.period));
    assert.notEqual(wasOccupied, undefined);
    assert.ok(slot.occupiedSpaces <= wasOccupied!);
  }
});
