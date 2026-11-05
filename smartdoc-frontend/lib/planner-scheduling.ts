import type { PlannerInput, PlannerItem } from "./api/workspace-types";

export function plannerLocalTime(date: string | null, timezone: string): string {
  return date ? new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(date)).replace(" ", "T") : "";
}

// Send local wall times; the API resolves them using the account's timezone.
export function schedulePlannerItem(item: PlannerItem, date: string, timezone: string): PlannerInput {
  const { id: _id, ...body } = item;
  void _id;
  if (item.kind === "task") {
    return { ...body, due_at: `${date}T${plannerLocalTime(item.due_at, timezone).slice(11) || "09:00"}` };
  }
  const start = plannerLocalTime(item.starts_at, timezone);
  const end = plannerLocalTime(item.ends_at, timezone);
  const duration = new Date(end + "Z").getTime() - new Date(start + "Z").getTime();
  const starts_at = `${date}T${start.slice(11)}`;
  const ends_at = new Date(new Date(starts_at + "Z").getTime() + duration).toISOString().slice(0, 16);
  return { ...body, starts_at, ends_at };
}
