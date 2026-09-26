import uhf from '../data/uhf.json'

type Ring = number[][]
type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }

type Feature = { properties: { id: string }; geometry: Geometry }

const features = (uhf as { features: Feature[] }).features

function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.log(Math.tan(Math.PI / 4 + rad / 2))
}

function boundsOf(all: Feature[]) {
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  const visit = (pair: number[]) => {
    minLon = Math.min(minLon, pair[0])
    maxLon = Math.max(maxLon, pair[0])
    minLat = Math.min(minLat, pair[1])
    maxLat = Math.max(maxLat, pair[1])
  }
  for (const feature of all) {
    const coords = feature.geometry.coordinates
    const walk = (node: unknown) => {
      if (!Array.isArray(node)) return
      if (typeof node[0] === 'number') visit(node as number[])
      else node.forEach(walk)
    }
    walk(coords)
  }
  return { minLon, maxLon, minLat, maxLat }
}

const bounds = boundsOf(features)
const padLon = (bounds.maxLon - bounds.minLon) * 0.03
const padLat = (bounds.maxLat - bounds.minLat) * 0.03
const minLon = bounds.minLon - padLon
const maxLon = bounds.maxLon + padLon
const minLat = bounds.minLat - padLat
const maxLat = bounds.maxLat + padLat
const yMax = mercatorY(maxLat)
const yMin = mercatorY(minLat)

export const MAP_WIDTH = 640
export const MAP_HEIGHT = 760

export function project(lon: number, lat: number): [number, number] {
  const x = ((lon - minLon) / (maxLon - minLon)) * MAP_WIDTH
  const y = ((yMax - mercatorY(lat)) / (yMax - yMin)) * MAP_HEIGHT
  return [x, y]
}

function projectRing(ring: Ring): [number, number][] {
  return ring.map((pair) => project(pair[0], pair[1]))
}

function outerRings(geometry: Geometry): Ring[] {
  if (geometry.type === 'Polygon') return geometry.coordinates[0] ? [geometry.coordinates[0]] : []
  return geometry.coordinates.flatMap((polygon) => (polygon[0] ? [polygon[0]] : []))
}

function ringPath(ring: Ring): string {
  return ring
    .map((pair, index) => {
      const [x, y] = project(pair[0], pair[1])
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
    .concat(' Z')
}

export type Box = { x0: number; y0: number; x1: number; y1: number }

export type NeighborhoodPath = {
  id: string
  d: string
  box: Box
  /** Outer rings in map coordinates. Holes are left out; UHF land has essentially none. */
  land: [number, number][][]
}

function ringBox(rings: Ring[]): Box {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }
  for (const ring of rings) {
    for (const pair of ring) {
      const [x, y] = project(pair[0], pair[1])
      box.x0 = Math.min(box.x0, x)
      box.y0 = Math.min(box.y0, y)
      box.x1 = Math.max(box.x1, x)
      box.y1 = Math.max(box.y1, y)
    }
  }
  return box
}

export function neighborhoodPaths(): NeighborhoodPath[] {
  return features.map((feature) => {
    const geom = feature.geometry
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()
    return {
      id: feature.properties.id,
      d: rings.map(ringPath).join(' '),
      box: ringBox(rings),
      land: outerRings(geom).map(projectRing),
    }
  })
}

function pointInProjectedRing(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function hash(value: number): number {
  let x = Math.imul(value + 1, 2654435761)
  x = Math.imul(x ^ (x >>> 16), 2246822507)
  x = Math.imul(x ^ (x >>> 13), 3266489909)
  return (x ^ (x >>> 16)) >>> 0
}

/** Marks that sit on neighborhood land, not in the river inside the bounding box. */
export function pointsOnLand(
  paths: NeighborhoodPath[],
  count: number,
  salt: number,
): { x: number; y: number }[] {
  if (!paths.length || count <= 0) return []
  const x0 = Math.min(...paths.map((path) => path.box.x0))
  const y0 = Math.min(...paths.map((path) => path.box.y0))
  const x1 = Math.max(...paths.map((path) => path.box.x1))
  const y1 = Math.max(...paths.map((path) => path.box.y1))
  const spanX = x1 - x0 || 1
  const spanY = y1 - y0 || 1
  const points: { x: number; y: number }[] = []
  const limit = count * 80
  for (let n = 0; points.length < count && n < limit; n++) {
    const x = x0 + ((hash(salt * 1000 + n) % 10000) / 10000) * spanX
    const y = y0 + ((hash(salt * 1000 + n + 17) % 10000) / 10000) * spanY
    const onLand = paths.some((path) => path.land.some((ring) => pointInProjectedRing(x, y, ring)))
    if (onLand) points.push({ x, y })
  }
  return points
}

/**
 * CSS transform that fits `boxes` inside the map frame with a margin.
 * Identity when there is nothing to fit.
 */
export function fitTransform(boxes: Box[], margin = 0.08): string {
  if (!boxes.length) return 'translate(0px, 0px) scale(1)'
  const x0 = Math.min(...boxes.map((b) => b.x0))
  const y0 = Math.min(...boxes.map((b) => b.y0))
  const x1 = Math.max(...boxes.map((b) => b.x1))
  const y1 = Math.max(...boxes.map((b) => b.y1))
  const w = x1 - x0
  const h = y1 - y0
  const scale = Math.min(MAP_WIDTH / (w * (1 + margin * 2)), MAP_HEIGHT / (h * (1 + margin * 2)))
  const tx = (MAP_WIDTH - w * scale) / 2 - x0 * scale
  const ty = (MAP_HEIGHT - h * scale) / 2 - y0 * scale
  return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`
}

function pointInRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]
    const crosses = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

function pointInGeometry(lon: number, lat: number, geometry: Geometry): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  return polygons.some((rings) => {
    if (!rings.length || !pointInRing(lon, lat, rings[0])) return false
    return !rings.slice(1).some((hole) => pointInRing(lon, lat, hole))
  })
}

/** UHF id containing this longitude and latitude, or null when it falls outside the city. */
export function neighborhoodIdAt(lon: number, lat: number): string | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  for (const feature of features) {
    if (feature.properties.id === '0') continue
    if (pointInGeometry(lon, lat, feature.geometry)) return feature.properties.id
  }
  return null
}
