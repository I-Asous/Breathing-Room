import { useEffect, useRef, useState } from 'react'
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl, type GeoJSONSource } from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import 'maplibre-gl/dist/maplibre-gl.css'
import { formatUg, type MonitorPoint } from '@/lib/metrics'

// The package worker imports a sibling chunk. Serving both from /maplibre keeps
// that import working in Vite dev and in the production asset build.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs')
import uhf from '@/data/uhf.json'
import { neighborhoodIdAt } from '@/lib/geo'

/**
 * OpenFreeMap's Liberty style is OpenStreetMap: streets, route names, and
 * buildings, with no API key. House numbers are in the same tiles; Liberty
 * does not draw them, so this map adds that layer at street zoom.
 */
const STYLE = 'https://tiles.openfreemap.org/styles/liberty'

const TONES = ['#e4efe6', '#d5e3d4', '#e5e0cf', '#ead6c4', '#e2bba4', '#cf8668', '#a3533c', '#6e3224']
const PAIRS: Record<string, string> = {
  '00': '#f1ece2',
  '10': '#e8bf9c',
  '20': '#c9785a',
  '01': '#b4c8cf',
  '11': '#ada28f',
  '21': '#966652',
  '02': '#6c93a6',
  '12': '#687773',
  '22': '#5a4b42',
}

type Ring = number[][]
type Geometry =
  | { type: 'Polygon'; coordinates: Ring[] }
  | { type: 'MultiPolygon'; coordinates: Ring[][] }
type UhfFeature = { type: 'Feature'; properties: { id: string }; geometry: Geometry }

const FEATURES = (uhf as { features: UhfFeature[] }).features

export type HoodPaint = {
  id: string
  color: string
  opacity: number
  line: number
  selected: number
}

export type MapPin = { id: string; lon: number; lat: number; label: string }

export type MapMonitor = {
  id: string
  lon: number
  lat: number
  title: string
  borough: string
  pm25: MonitorPoint[]
  no2: MonitorPoint[]
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

function pointRow(label: string, point: MonitorPoint): string {
  const unit = label === 'PM2.5' ? 'µg/m³' : 'ppb'
  const note = point.certified ? '' : ' (preliminary)'
  return `<p>${label} ${formatUg(point.value)} ${unit}, ${point.year}${note}</p>`
}

function monitorPopupHtml(monitor: MapMonitor): string {
  const rows = [...monitor.pm25.map((p) => pointRow('PM2.5', p)), ...monitor.no2.map((p) => pointRow('NO2', p))].join('')
  return (
    `<p class="monitor-popup-title"><strong>${escapeHtml(monitor.title)}</strong> · ${escapeHtml(monitor.borough)}</p>` +
    `<div class="monitor-popup-body">${rows}</div>`
  )
}

type Road = { coords: [number, number][]; seg: number[] }

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export function hoodColor(reading: { tone: number | null; pair?: { rent: number; asthma: number } } | undefined): string {
  if (reading?.pair) return PAIRS[`${reading.pair.rent}${reading.pair.asthma}`] ?? '#e6e0d2'
  if (reading?.tone == null) return '#e6e0d2'
  return TONES[reading.tone] ?? '#e6e0d2'
}

function walkCoords(geometry: Geometry, visit: (lon: number, lat: number) => void) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const rings of polygons) {
    for (const ring of rings) {
      for (const pair of ring) visit(pair[0], pair[1])
    }
  }
}

function boundsFor(ids: string[] | null): [[number, number], [number, number]] {
  const want = ids ? new Set(ids) : null
  let west = 180
  let south = 90
  let east = -180
  let north = -90
  for (const feature of FEATURES) {
    if (want && !want.has(feature.properties.id)) continue
    walkCoords(feature.geometry, (lon, lat) => {
      west = Math.min(west, lon)
      south = Math.min(south, lat)
      east = Math.max(east, lon)
      north = Math.max(north, lat)
    })
  }
  return [
    [west, south],
    [east, north],
  ]
}

function hoodData(paints: HoodPaint[]): FeatureCollection {
  const byId = new Map(paints.map((paint) => [paint.id, paint]))
  return {
    type: 'FeatureCollection',
    features: FEATURES.map((feature) => {
      const paint = byId.get(feature.properties.id)
      return {
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
          id: feature.properties.id,
          color: paint?.color ?? '#e6e0d2',
          opacity: paint?.opacity ?? 0.5,
          line: paint?.line ?? 0.7,
          selected: paint?.selected ?? 0,
        },
      }
    }),
  }
}

function measure(coords: [number, number][]): Road | null {
  if (coords.length < 2) return null
  const seg = [0]
  for (let i = 1; i < coords.length; i++) {
    const dx = coords[i][0] - coords[i - 1][0]
    const dy = (coords[i][1] - coords[i - 1][1]) * 1.32
    seg.push(seg[i - 1] + Math.hypot(dx, dy))
  }
  if (seg[seg.length - 1] < 0.0008) return null
  return { coords, seg }
}

function along(road: Road, t: number): [number, number] {
  const length = road.seg[road.seg.length - 1] || 1
  let distance = (((t % 1) + 1) % 1) * length
  for (let i = 1; i < road.seg.length; i++) {
    if (road.seg[i] < distance) continue
    const span = road.seg[i] - road.seg[i - 1] || 1
    const u = (distance - road.seg[i - 1]) / span
    const a = road.coords[i - 1]
    const b = road.coords[i]
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]
  }
  return road.coords[road.coords.length - 1]
}

function roadsInView(map: MapLibreMap, ids: Set<string>): Road[] {
  const layers = (map.getStyle().layers ?? [])
    .filter((layer) => {
      if (layer.type !== 'line') return false
      if (!/^(road|bridge)_/.test(layer.id)) return false
      return !/casing|rail|path|service|hatching|pier|tunnel/.test(layer.id)
    })
    .map((layer) => layer.id)
  if (!layers.length) return []
  const features = map.queryRenderedFeatures({ layers })
  const seen = new Set<string>()
  const roads: Road[] = []
  for (const feature of features) {
    const geometry = feature.geometry
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates as [number, number][]]
        : geometry.type === 'MultiLineString'
          ? (geometry.coordinates as [number, number][][])
          : []
    for (const coords of lines) {
      const mid = coords[Math.floor(coords.length / 2)]
      if (!mid) continue
      const home = neighborhoodIdAt(mid[0], mid[1])
      if (!home || !ids.has(home)) continue
      const key = `${mid[0].toFixed(4)},${mid[1].toFixed(4)},${coords.length}`
      if (seen.has(key)) continue
      seen.add(key)
      const road = measure(coords)
      if (road) roads.push(road)
    }
  }
  roads.sort((a, b) => b.seg[b.seg.length - 1] - a.seg[a.seg.length - 1])
  return roads.slice(0, 80)
}

type Props = {
  paints: HoodPaint[]
  focusId: string | null
  scopeIds: string[]
  monitors: MapMonitor[]
  showMonitors: boolean
  activeMonitorId: string | null
  onSelectHood: (id: string) => void
  onSelectMonitor: (id: string) => void
  pin: MapPin | null
  traffic: { count: number; hour: number; playing: boolean; relative: number } | null
  label?: string
}

export default function StreetMap({
  paints,
  focusId,
  scopeIds,
  monitors,
  showMonitors,
  activeMonitorId,
  onSelectHood,
  onSelectMonitor,
  pin,
  traffic,
  label = 'New York streets and neighborhoods',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const roadsRef = useRef<Road[]>([])
  const onHood = useRef(onSelectHood)
  const onMonitor = useRef(onSelectMonitor)
  const scopeRef = useRef(scopeIds)
  const trafficRef = useRef(traffic)
  const drawTraffic = useRef<() => void>(() => {})
  const popupRef = useRef<Popup | null>(null)
  const activeMonitorIdRef = useRef(activeMonitorId)
  const [ready, setReady] = useState(false)
  onHood.current = onSelectHood
  onMonitor.current = onSelectMonitor
  scopeRef.current = scopeIds
  trafficRef.current = traffic
  activeMonitorIdRef.current = activeMonitorId

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const map = new MapLibreMap({
      container,
      style: STYLE,
      bounds: boundsFor(null),
      fitBoundsOptions: { padding: 24 },
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      fadeDuration: 0,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    const popup = new Popup({ closeButton: true, closeOnClick: false, offset: 14, maxWidth: '230px', className: 'monitor-popup' })
    popup.on('close', () => {
      // Fires both from the user's own × click and from our own `.remove()`
      // calls below — only the id ref (always current) tells them apart, so
      // this only clears state when something is actually still selected.
      if (activeMonitorIdRef.current) onMonitor.current(activeMonitorIdRef.current)
    })
    popupRef.current = popup

    map.on('load', () => {
      const before = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
      map.addSource('hoods', { type: 'geojson', data: EMPTY })
      map.addLayer(
        {
          id: 'hoods',
          type: 'fill',
          source: 'hoods',
          paint: {
            'fill-color': ['get', 'color'],
            'fill-opacity': ['get', 'opacity'],
          },
        },
        before,
      )
      map.addLayer(
        {
          id: 'hood-line',
          type: 'line',
          source: 'hoods',
          paint: {
            'line-color': '#1c1915',
            'line-width': ['case', ['==', ['get', 'selected'], 1], 2.4, 0.8],
            'line-opacity': ['get', 'line'],
          },
        },
        before,
      )
      map.addLayer({
        id: 'addresses',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'housenumber',
        minzoom: 16,
        layout: {
          'text-field': ['coalesce', ['get', 'housenumber'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
        },
        paint: {
          'text-color': '#1c1915',
          'text-halo-color': '#faf7f0',
          'text-halo-width': 1.2,
        },
      })
      map.addSource('monitors', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'monitors',
        type: 'circle',
        source: 'monitors',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'active'], 1], 7, 5],
          'circle-color': '#faf7f0',
          'circle-stroke-color': '#1c1915',
          'circle-stroke-width': 2,
        },
      })
      map.addSource('traffic', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'traffic',
        type: 'circle',
        source: 'traffic',
        paint: {
          'circle-radius': 3.2,
          'circle-color': '#1c1915',
          'circle-stroke-color': '#faf7f0',
          'circle-stroke-width': 1,
        },
      })
      map.addSource('pin', { type: 'geojson', data: EMPTY })
      map.addLayer({
        id: 'pin',
        type: 'circle',
        source: 'pin',
        paint: {
          'circle-radius': 7,
          'circle-color': '#8f3d2c',
          'circle-stroke-color': '#faf7f0',
          'circle-stroke-width': 2,
        },
      })

      map.on('click', (event) => {
        const monitor = map.queryRenderedFeatures(event.point, { layers: ['monitors'] })[0]
        if (monitor?.properties?.id) {
          onMonitor.current(String(monitor.properties.id))
          return
        }
        const hood = map.queryRenderedFeatures(event.point, { layers: ['hoods'] })[0]
        if (hood?.properties?.id) onHood.current(String(hood.properties.id))
      })
      map.on('mouseenter', 'hoods', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'hoods', () => {
        map.getCanvas().style.cursor = ''
      })
      map.on('idle', () => {
        const ids = new Set(scopeRef.current)
        roadsRef.current = ids.size && trafficRef.current ? roadsInView(map, ids) : []
        drawTraffic.current()
      })
      setReady(true)
    })

    const observer = new ResizeObserver(() => map.resize())
    observer.observe(container)
    return () => {
      observer.disconnect()
      popup.remove()
      popupRef.current = null
      map.remove()
      mapRef.current = null
      setReady(false)
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('hoods') as GeoJSONSource | undefined
    source?.setData(hoodData(paints))
  }, [paints, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('monitors') as GeoJSONSource | undefined
    source?.setData(
      showMonitors
        ? {
            type: 'FeatureCollection',
            features: monitors.map((monitor) => ({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [monitor.lon, monitor.lat] },
              properties: { id: monitor.id, active: monitor.id === activeMonitorId ? 1 : 0 },
            })),
          }
        : EMPTY,
    )
  }, [monitors, showMonitors, activeMonitorId, ready])

  useEffect(() => {
    const map = mapRef.current
    const popup = popupRef.current
    if (!map || !popup || !ready) return
    if (!activeMonitorId || !showMonitors) {
      if (popup.isOpen()) popup.remove()
      return
    }
    const monitor = monitors.find((m) => m.id === activeMonitorId)
    if (!monitor) return
    popup.setLngLat([monitor.lon, monitor.lat]).setHTML(monitorPopupHtml(monitor))
    if (!popup.isOpen()) popup.addTo(map)
  }, [activeMonitorId, monitors, showMonitors, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('pin') as GeoJSONSource | undefined
    source?.setData(
      pin
        ? {
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [pin.lon, pin.lat] },
                properties: { label: pin.label },
              },
            ],
          }
        : EMPTY,
    )
  }, [pin, ready])

  const scopeKey = scopeIds.join(',')
  const pinKey = pin ? `${pin.lon},${pin.lat}` : ''
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    if (pin) {
      map.flyTo({ center: [pin.lon, pin.lat], zoom: 16.6, essential: true })
      return
    }
    map.fitBounds(boundsFor(focusId ? [focusId] : scopeIds.length ? scopeIds : null), {
      padding: { top: 28, bottom: 72, left: 28, right: 28 },
      maxZoom: focusId ? 15.4 : scopeIds.length ? 12.5 : 11,
      duration: 700,
    })
  }, [ready, focusId, scopeKey, pinKey, pin, scopeIds])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const source = map.getSource('traffic') as GeoJSONSource | undefined
    if (!source) return
    if (!traffic) {
      roadsRef.current = []
      source.setData(EMPTY)
      drawTraffic.current = () => source.setData(EMPTY)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    const draw = () => {
      const roads = roadsRef.current
      const live = trafficRef.current
      if (!source || !live || !roads.length) {
        source?.setData(EMPTY)
        return
      }
      const drift =
        live.playing && !reduced ? (performance.now() / 1000) * 0.035 * Math.max(0.4, live.relative) : 0
      source.setData({
        type: 'FeatureCollection',
        features: Array.from({ length: live.count }, (_, index) => {
          const road = roads[(index * 3) % roads.length]
          const at = along(road, index * 0.173 + live.hour / 24 + drift)
          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: at },
            properties: {},
          }
        }),
      })
    }
    drawTraffic.current = draw
    draw()
    if (traffic.playing && !reduced) {
      const loop = () => {
        draw()
        frame = window.requestAnimationFrame(loop)
      }
      frame = window.requestAnimationFrame(loop)
    }
    return () => {
      window.cancelAnimationFrame(frame)
      drawTraffic.current = () => {}
    }
  }, [ready, traffic?.count, traffic?.hour, traffic?.playing, traffic?.relative, scopeKey])

  return <div ref={containerRef} className="street-map" role="group" aria-label={label} />
}
