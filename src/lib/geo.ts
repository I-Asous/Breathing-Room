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

function ringPath(ring: Ring): string {
  return ring
    .map((pair, index) => {
      const [x, y] = project(pair[0], pair[1])
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
    .concat(' Z')
}

export function neighborhoodPaths(): { id: string; d: string }[] {
  return features.map((feature) => {
    const geom = feature.geometry
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat()
    return { id: feature.properties.id, d: rings.map(ringPath).join(' ') }
  })
}
