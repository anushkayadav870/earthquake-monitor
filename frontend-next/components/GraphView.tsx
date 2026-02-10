'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, CircleMarker, Polyline, Tooltip as LeafletTooltip, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { fetchNeo4jGraph, fetchTopCentralQuakes, type GraphNode, type GraphEdge } from '../lib/api'
import type { MapFilters } from './FilterPanel'

// Fix Leaflet marker icons
if (typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    })
}

interface GraphViewProps {
    filters: MapFilters
    onNodeSelect: (node: any) => void
}

// Component to handle map centering when data loads
function MapController({ nodes }: { nodes: GraphNode[] }) {
    const map = useMap()
    useEffect(() => {
        if (nodes.length > 0) {
            const coords = nodes
                .filter(n => n.lat !== undefined && n.lon !== undefined)
                .map(n => [n.lat!, n.lon!] as [number, number])

            if (coords.length > 0) {
                const bounds = L.latLngBounds(coords)
                map.fitBounds(bounds, { padding: [50, 50] })
            }
        }
    }, [nodes, map])
    return null
}

// Helper component to render a link with an arrowhead
function LinkWithArrow({ link, sourceNode, targetNode, color, isSelected, label, onSelect }: { link: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode, color: string, isSelected: boolean, label: string, onSelect: (e: any) => void }) {
    const map = useMap()

    // Calculate arrow position and rotation
    const arrowData = useMemo(() => {
        if (!sourceNode.lat || !sourceNode.lon || !targetNode.lat || !targetNode.lon) return null

        const p1 = map.project([sourceNode.lat, sourceNode.lon], map.getZoom())
        const p2 = map.project([targetNode.lat, targetNode.lon], map.getZoom())

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)

        // Offset the arrow from the exact target center to be near the edge of the circle
        const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2))
        const offset = 12 // Adjust based on node size
        const ratio = Math.max(0, (dist - offset) / dist)

        const arrowX = p1.x + (p2.x - p1.x) * ratio
        const arrowY = p1.y + (p2.y - p1.y) * ratio

        return {
            pos: map.unproject([arrowX, arrowY], map.getZoom()),
            rotation: angle
        }
    }, [sourceNode.lat, sourceNode.lon, targetNode.lat, targetNode.lon, map, map.getZoom()])

    if (!arrowData) return null

    const arrowIcon = L.divIcon({
        className: 'custom-arrow-icon',
        html: `
            <div style="transform: rotate(${arrowData.rotation}deg); width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 8px solid ${isSelected ? '#fff' : color};"></div>
        `,
        iconSize: [8, 8],
        iconAnchor: [4, 4]
    })

    return (
        <>
            <Polyline
                positions={[
                    [sourceNode.lat!, sourceNode.lon!],
                    [targetNode.lat!, targetNode.lon!]
                ]}
                pathOptions={{
                    color: isSelected ? '#fff' : color,
                    weight: isSelected ? 4 : 1.5,
                    opacity: isSelected ? 1 : 0.6,
                    dashArray: link.type === 'NEAR' ? '5, 10' : undefined
                }}
                eventHandlers={{
                    click: onSelect
                }}
            >
                <LeafletTooltip sticky direction="top" opacity={1}>
                    <div className="bg-slate-900/90 backdrop-blur text-[10px] text-white px-3 py-1 rounded-full font-black uppercase tracking-widest shadow-xl border border-white/20">
                        {label}
                    </div>
                </LeafletTooltip>
            </Polyline>
            <Marker position={arrowData.pos} icon={arrowIcon} interactive={false} />
        </>
    )
}

export default function GraphView({ filters, onNodeSelect }: GraphViewProps) {
    const [data, setData] = useState<{ nodes: GraphNode[]; links: GraphEdge[] }>({ nodes: [], links: [] })
    const [loading, setLoading] = useState(true)
    const [selectedId, setSelectedId] = useState<string | null>(null)
    // Centrality data could be useful but we'll focus on the graph viz for now. 
    // If needed we can fetch it and pass it up or display on nodes.

    useEffect(() => {
        const loadGraph = async () => {
            setLoading(true)
            try {
                const now = Date.now()
                const startTime = now - filters.timeRangeHours * 60 * 60 * 1000

                let minMag = filters.magnitudeMin
                let maxMag = filters.magnitudeMax

                if (filters.magnitudeMode === 'exact') {
                    minMag = filters.magnitudeExact - 0.1
                    maxMag = filters.magnitudeExact + 0.1
                }

                const relationshipTypes: string[] = []
                if (filters.showEpicenters) relationshipTypes.push('EPICENTER_OF')
                if (filters.showAftershocks) relationshipTypes.push('AFTERSHOCK_OF')
                if (filters.showForeshocks) relationshipTypes.push('FORESHOCK_OF')
                if (filters.showTriggered) relationshipTypes.push('TRIGGERED')
                if (filters.showNear) relationshipTypes.push('NEAR')

                const [graphData] = await Promise.all([
                    fetchNeo4jGraph({
                        start_time: startTime,
                        // end_time: now,
                        min_mag: minMag,
                        max_mag: maxMag,
                        relationship_types: relationshipTypes.length > 0 ? relationshipTypes : undefined
                    })
                ])

                setData({
                    nodes: graphData.nodes,
                    links: graphData.edges.map((e: any, i: number) => ({
                        ...e,
                        id: e.id || `edge-${e.source}-${e.target}-${e.type}-${i}`,
                        syntheticId: true
                    })) as any
                })
            } catch (e) {
                console.error('Failed to fetch graph data', e)
            } finally {
                setLoading(false)
            }
        }

        loadGraph()
    }, [filters])

    const getRelLabel = (type: string) => {
        switch (type) {
            case 'EPICENTER_OF': return 'Epicenter'
            case 'AFTERSHOCK_OF': return 'Aftershock'
            case 'FORESHOCK_OF': return 'Foreshock'
            case 'TRIGGERED': return 'Triggered'
            case 'BELONGS_TO_CLUSTER': return 'In Cluster'
            case 'NEAR': return 'Nearby'
            default: return type.replace(/_/g, ' ')
        }
    }

    const getRelColor = (type: string) => {
        switch (type) {
            case 'EPICENTER_OF': return '#ef4444' // Red
            case 'AFTERSHOCK_OF': return '#f97316' // Orange
            case 'FORESHOCK_OF': return '#eab308' // Yellow
            case 'TRIGGERED': return '#a855f7' // Purple
            case 'BELONGS_TO_CLUSTER': return '#10b981' // Green
            case 'NEAR': return '#3b82f6' // Blue
            default: return '#94a3b8'
        }
    }

    const getNodeColor = (node: any) => {
        if (selectedId === node.id) return '#fff'
        switch (node.label) {
            case 'Earthquake':
                const mag = node.mag || 0
                if (mag >= 6) return '#ef4444'
                if (mag >= 4) return '#f97316'
                if (mag >= 3) return '#fbbf24'
                return '#3b82f6'
            case 'Cluster': return '#10b981'
            case 'City': return '#9333ea'
            default: return '#64748b'
        }
    }

    if (loading && data.nodes.length === 0) {
        return (
            <div className="w-full h-full flex items-center justify-center bg-slate-900 text-slate-400 italic">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    Projection Geo-Spatial Graph onto Map...
                </div>
            </div>
        )
    }

    return (
        <div className="w-full h-full bg-[#1e293b] overflow-hidden relative font-sans">
            <MapContainer
                center={[0, 0]}
                zoom={2}
                style={{ width: '100%', height: '100%', background: '#0f172a' }}
                zoomControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
                />

                <MapController nodes={data.nodes} />

                {/* Nodes (Earthquakes, etc) */}
                {data.nodes.map(node => {
                    if (node.lat === undefined || node.lon === undefined) return null
                    const color = getNodeColor(node)
                    const size = node.mag ? Math.max(8, node.mag * 3) : 10

                    return (
                        <CircleMarker
                            key={`node-${node.id}`}
                            center={[node.lat, node.lon]}
                            radius={size}
                            pathOptions={{
                                fillColor: color,
                                color: selectedId === node.id ? '#fff' : 'rgba(255,255,255,0.2)',
                                weight: selectedId === node.id ? 3 : 1,
                                fillOpacity: 0.8
                            }}
                            eventHandlers={{
                                click: (e: any) => {
                                    L.DomEvent.stopPropagation(e)
                                    setSelectedId(node.id)
                                    onNodeSelect(node)
                                }
                            }}
                        >
                            <LeafletTooltip direction="top" offset={[0, -10]} opacity={1}>
                                <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-white shadow-2xl min-w-[200px]">
                                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
                                        <span className="text-[10px] font-black uppercase text-indigo-400 tracking-widest">{node.label}</span>
                                        <span className="text-[10px] font-mono text-slate-500">#{node.id.slice(-4)}</span>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-lg font-black text-white border border-slate-700">
                                            {node.mag || '?'}
                                        </div>
                                        <div className="flex-1">
                                            <div className="text-[11px] font-bold text-slate-200 leading-tight mb-1">{node.place || 'Unknown Location'}</div>
                                            <div className="text-[9px] text-slate-400">
                                                {node.time ? new Date(node.time).toLocaleString() : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2">
                                        <div className="bg-slate-800/50 p-1.5 rounded border border-slate-700/50">
                                            <div className="text-[8px] uppercase text-slate-500 font-bold">Depth</div>
                                            <div className="text-xs font-mono">{node.depth ? `${node.depth}km` : 'N/A'}</div>
                                        </div>
                                        <div className="bg-slate-800/50 p-1.5 rounded border border-slate-700/50">
                                            <div className="text-[8px] uppercase text-slate-500 font-bold">Degree</div>
                                            <div className="text-xs font-mono">{node.degree || 0}</div>
                                        </div>
                                    </div>
                                    <div className="mt-2 text-[9px] text-center text-slate-500 italic">
                                        Click to view details & relationships
                                    </div>
                                </div>
                            </LeafletTooltip>
                        </CircleMarker>
                    )
                })}

                {/* Links (Relationships) */}
                {data.links.map(link => {
                    // Apply Filters
                    if (link.type === 'EPICENTER_OF' && !filters.showEpicenters) return null
                    if (link.type === 'AFTERSHOCK_OF' && !filters.showAftershocks) return null
                    if (link.type === 'FORESHOCK_OF' && !filters.showForeshocks) return null
                    if (link.type === 'TRIGGERED' && !filters.showTriggered) return null
                    if (link.type === 'NEAR' && !filters.showNear) return null

                    const sourceNode = data.nodes.find(n => n.id === link.source)
                    const targetNode = data.nodes.find(n => n.id === link.target)

                    if (!sourceNode || !targetNode ||
                        sourceNode.lat === undefined || sourceNode.lon === undefined ||
                        targetNode.lat === undefined || targetNode.lon === undefined) return null

                    const color = getRelColor(link.type)
                    const isSelected = selectedId === (link as any).id

                    return (
                        <LinkWithArrow
                            key={`link-${link.id}`}
                            link={link}
                            sourceNode={sourceNode}
                            targetNode={targetNode}
                            color={color}
                            isSelected={isSelected}
                            label={getRelLabel(link.type)}
                            onSelect={(e: any) => {
                                L.DomEvent.stopPropagation(e)
                                onNodeSelect(link) // Select link too? Or just node
                            }}
                        />
                    )
                })}
            </MapContainer>
        </div>
    )
}
