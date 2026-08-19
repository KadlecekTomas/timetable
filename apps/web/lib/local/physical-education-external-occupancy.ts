import type { LocalAvailability, LocalProject } from "./api";

export const PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY =
  "rozvrhar:pe-external-occupancy:v1";
export const PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_REASON_PREFIX =
  "PE_EXTERNAL_CAPACITY:";

export const PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY = [0, 3, 3, 5, 3] as const;

export interface PhysicalEducationExternalOccupancySlot {
  dayOfWeek: number;
  period: number;
  occupiedSpaces: number;
}

export interface PhysicalEducationExternalOccupancyState {
  version: 2;
  updatedAt: string;
  slots: PhysicalEducationExternalOccupancySlot[];
}

/**
 * Původní provozní zadání 1. stupně. Je záměrně zachované jako samostatný
 * preset, protože odpovídá původně zadané obsazenosti, ale u aktuálního
 * rozvrhu 2. stupně je příliš těsné a vede k neproveditelnému modelu.
 */
export const SCHOOL_DEFAULT_PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_SLOTS = [
  { dayOfWeek: 1, period: 0, occupiedSpaces: 2 },
  { dayOfWeek: 1, period: 1, occupiedSpaces: 2 },
  { dayOfWeek: 1, period: 2, occupiedSpaces: 2 },
  { dayOfWeek: 1, period: 3, occupiedSpaces: 2 },
  { dayOfWeek: 1, period: 4, occupiedSpaces: 3 },
  { dayOfWeek: 3, period: 0, occupiedSpaces: 2 },
  { dayOfWeek: 3, period: 1, occupiedSpaces: 2 },
  { dayOfWeek: 3, period: 2, occupiedSpaces: 2 },
  { dayOfWeek: 3, period: 3, occupiedSpaces: 3 },
  { dayOfWeek: 4, period: 0, occupiedSpaces: 2 },
  { dayOfWeek: 4, period: 1, occupiedSpaces: 2 },
] satisfies PhysicalEducationExternalOccupancySlot[];

/**
 * Doporučený provozní profil 2026/27. Zachovává všechny původní rezervace,
 * ale v devíti kritických prostor-hodinách ponechá 1. stupni jeden prostor
 * místo dvou. Tím zůstává blokace explicitní a současně má 2. stupeň
 * kapacitu, se kterou byl pro aktuální školní model nalezen validní rozvrh.
 */
export const SCHOOL_RECOMMENDED_PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_SLOTS = [
  { dayOfWeek: 1, period: 0, occupiedSpaces: 1 },
  { dayOfWeek: 1, period: 1, occupiedSpaces: 1 },
  { dayOfWeek: 1, period: 2, occupiedSpaces: 1 },
  { dayOfWeek: 1, period: 3, occupiedSpaces: 1 },
  { dayOfWeek: 1, period: 4, occupiedSpaces: 3 },
  { dayOfWeek: 3, period: 0, occupiedSpaces: 1 },
  { dayOfWeek: 3, period: 1, occupiedSpaces: 1 },
  { dayOfWeek: 3, period: 2, occupiedSpaces: 1 },
  { dayOfWeek: 3, period: 3, occupiedSpaces: 3 },
  { dayOfWeek: 4, period: 0, occupiedSpaces: 1 },
  { dayOfWeek: 4, period: 1, occupiedSpaces: 1 },
] satisfies PhysicalEducationExternalOccupancySlot[];

export function schoolDefaultPhysicalEducationExternalOccupancySlots(): PhysicalEducationExternalOccupancySlot[] {
  return SCHOOL_DEFAULT_PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_SLOTS.map(
    (slot) => ({ ...slot }),
  );
}

export function schoolRecommendedPhysicalEducationExternalOccupancySlots(): PhysicalEducationExternalOccupancySlot[] {
  return SCHOOL_RECOMMENDED_PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_SLOTS.map(
    (slot) => ({ ...slot }),
  );
}

const CHANGE_EVENT = "rozvrhar:pe-external-occupancy-changed";
const PHYSICAL_EDUCATION_ROOM_TYPE_ID = "room-type:TV";

function emptyState(): PhysicalEducationExternalOccupancyState {
  return {
    version: 2,
    updatedAt: new Date(0).toISOString(),
    slots: schoolDefaultPhysicalEducationExternalOccupancySlots(),
  };
}

export function normalizePhysicalEducationExternalOccupancySlots(
  value: unknown,
): PhysicalEducationExternalOccupancySlot[] {
  if (!Array.isArray(value)) return [];

  const slots = new Map<string, PhysicalEducationExternalOccupancySlot>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    const dayOfWeek = Number(item.dayOfWeek);
    const period = Number(item.period);
    const occupiedSpaces = Number(item.occupiedSpaces);
    if (
      !Number.isInteger(dayOfWeek) ||
      dayOfWeek < 0 ||
      dayOfWeek >= PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY.length ||
      !Number.isInteger(period) ||
      period < 0 ||
      period >= 16 ||
      !Number.isInteger(occupiedSpaces)
    ) {
      continue;
    }
    const maxCapacity = PHYSICAL_EDUCATION_BASE_CAPACITY_BY_DAY[dayOfWeek] ?? 0;
    const normalized = Math.min(maxCapacity, Math.max(0, occupiedSpaces));
    if (normalized === 0) continue;
    slots.set(`${dayOfWeek}:${period}`, {
      dayOfWeek,
      period,
      occupiedSpaces: normalized,
    });
  }

  return [...slots.values()].sort(
    (left, right) =>
      left.dayOfWeek - right.dayOfWeek || left.period - right.period,
  );
}

export function loadPhysicalEducationExternalOccupancy(): PhysicalEducationExternalOccupancyState {
  if (typeof window === "undefined") return emptyState();
  const raw = window.localStorage.getItem(
    PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY,
  );
  if (!raw) return emptyState();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const normalizedSlots = normalizePhysicalEducationExternalOccupancySlots(
      parsed.slots,
    );
    const isCurrentVersion = Number(parsed.version) === 2;
    return {
      version: 2,
      updatedAt:
        typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date(0).toISOString(),
      slots:
        isCurrentVersion || normalizedSlots.length > 0
          ? normalizedSlots
          : schoolDefaultPhysicalEducationExternalOccupancySlots(),
    };
  } catch {
    return emptyState();
  }
}

export function savePhysicalEducationExternalOccupancy(
  slots: PhysicalEducationExternalOccupancySlot[],
): PhysicalEducationExternalOccupancyState {
  if (typeof window === "undefined") {
    throw new Error("Obsazenost TV prostorů lze uložit pouze v prohlížeči.");
  }
  const state: PhysicalEducationExternalOccupancyState = {
    version: 2,
    updatedAt: new Date().toISOString(),
    slots: normalizePhysicalEducationExternalOccupancySlots(slots),
  };
  window.localStorage.setItem(
    PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_STORAGE_KEY,
    JSON.stringify(state),
  );
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return state;
}

export function subscribePhysicalEducationExternalOccupancy(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

export function occupiedPhysicalEducationSpacesAt(
  slots: PhysicalEducationExternalOccupancySlot[],
  dayOfWeek: number,
  period: number,
): number {
  return (
    slots.find((slot) => slot.dayOfWeek === dayOfWeek && slot.period === period)
      ?.occupiedSpaces ?? 0
  );
}

function withoutExternalPhysicalEducationAvailability(
  project: LocalProject,
): LocalProject {
  return {
    ...project,
    availability: project.availability.filter(
      (rule) =>
        !rule.reason?.startsWith(
          PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_REASON_PREFIX,
        ),
    ),
  };
}

export function physicalEducationExternalAvailability(
  project: LocalProject,
  slots: PhysicalEducationExternalOccupancySlot[],
): LocalAvailability[] {
  const cleanProject = withoutExternalPhysicalEducationAvailability(project);
  const sportRoomIds = cleanProject.rooms
    .filter((room) => room.roomTypeId === PHYSICAL_EDUCATION_ROOM_TYPE_ID)
    .map((room) => room.id);
  if (sportRoomIds.length === 0) return [];

  return normalizePhysicalEducationExternalOccupancySlots(slots).flatMap(
    (slot) => {
      if (slot.period >= (cleanProject.periodsPerDay[slot.dayOfWeek] ?? 0)) {
        return [];
      }

      const unavailableRoomIds = new Set(
        cleanProject.availability
          .filter(
            (rule) =>
              rule.entityType === "ROOM" &&
              rule.kind === "UNAVAILABLE" &&
              rule.dayOfWeek === slot.dayOfWeek &&
              rule.period === slot.period,
          )
          .map((rule) => rule.entityId),
      );
      const availableRoomIds = sportRoomIds.filter(
        (roomId) => !unavailableRoomIds.has(roomId),
      );
      const occupiedCount = Math.min(
        slot.occupiedSpaces,
        availableRoomIds.length,
      );
      const blockedRoomIds = availableRoomIds.slice(
        Math.max(0, availableRoomIds.length - occupiedCount),
      );

      return blockedRoomIds.map((roomId) => ({
        id: `availability:pe-external:${slot.dayOfWeek}:${slot.period}:${roomId}`,
        entityType: "ROOM" as const,
        entityId: roomId,
        dayOfWeek: slot.dayOfWeek,
        period: slot.period,
        kind: "UNAVAILABLE" as const,
        weight: null,
        reason: `${PHYSICAL_EDUCATION_EXTERNAL_OCCUPANCY_REASON_PREFIX}1. stupeň zabírá ${slot.occupiedSpaces} z ${availableRoomIds.length} dostupných TV prostorů.`,
      }));
    },
  );
}

export function applyPhysicalEducationExternalOccupancy(
  project: LocalProject,
  slots: PhysicalEducationExternalOccupancySlot[],
): LocalProject {
  const cleanProject = withoutExternalPhysicalEducationAvailability(project);
  const externalAvailability = physicalEducationExternalAvailability(
    cleanProject,
    slots,
  );
  return {
    ...cleanProject,
    availability: [...cleanProject.availability, ...externalAvailability],
  };
}
