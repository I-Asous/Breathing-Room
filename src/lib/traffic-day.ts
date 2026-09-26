/**
 * Weekday vehicles entering the Manhattan Congestion Relief Zone, by hour.
 *
 * Each value is the sum of `crz_entries` divided by the number of weekdays,
 * from MTA counts on data.ny.gov (t6yz-b64h), Saturdays and Sundays left out.
 * The query covered 445 weekdays. These are zone entries, not cars counted
 * on a neighborhood street.
 *
 * The air curve keeps that shape and this place's 2024 annual mean as its
 * average. NO2, the traffic-linked pollutant in the community air survey,
 * moves with the entries. PM2.5 moves less, because more of it is regional.
 * Neither line is an hourly monitor reading, and neither scores the toll.
 */
const WEEKDAY_ENTRY_SUMS = [
  4537625, 2976656, 2118002, 2102078, 4024400, 6472487, 11109635, 12951284, 13715569, 13179644,
  11892707, 11123474, 10766793, 10701339, 11137732, 11454753, 11395917, 11235480, 11306315, 10501424,
  9166861, 9435611, 8776301, 6970264,
]

const WEEKDAY_DAYS = 445

export const WEEKDAY_CRZ_ENTRIES: number[] = WEEKDAY_ENTRY_SUMS.map((sum) =>
  Math.round(sum / WEEKDAY_DAYS),
)

const MEAN_ENTRIES = WEEKDAY_CRZ_ENTRIES.reduce((sum, value) => sum + value, 0) / WEEKDAY_CRZ_ENTRIES.length

export type HourAir = {
  hour: number
  entries: number
  /** Entries this hour divided by the average hour. 1 is a typical hour. */
  relative: number
  no2: number | null
  pm25: number | null
}

export function hourAir(annualNo2: number | null, annualPm: number | null, hour: number): HourAir {
  const index = ((hour % 24) + 24) % 24
  const entries = WEEKDAY_CRZ_ENTRIES[index] ?? 0
  const relative = MEAN_ENTRIES > 0 ? entries / MEAN_ENTRIES : 1
  return {
    hour: index,
    entries,
    relative,
    no2: annualNo2 == null ? null : annualNo2 * (0.62 + 0.38 * relative),
    pm25: annualPm == null ? null : annualPm * (0.82 + 0.18 * relative),
  }
}

export function formatClock(hour: number): string {
  const index = ((hour % 24) + 24) % 24
  const hour12 = index % 12 || 12
  return `${hour12} ${index < 12 ? 'a.m.' : 'p.m.'}`
}

/** How many traffic marks to draw. Busier hours, and places with higher NO2, get more. */
export function trafficMarkCount(relative: number, annualNo2: number | null, cityNo2: number | null): number {
  const local = annualNo2 != null && cityNo2 != null && cityNo2 > 0 ? annualNo2 / cityNo2 : 1
  const rush = Math.min(1, relative / 1.5)
  return Math.max(4, Math.min(36, Math.round(4 + 32 * rush * Math.min(local, 1.6))))
}
