"use client"

import { useEffect, useState, useMemo } from 'react'
import { LayerGroup, CircleMarker, Polyline, Tooltip, useMap, Marker } from 'react-leaflet'
import L from 'leaflet'
import { fetchNeo4jGraph, GraphNode, GraphEdge } from '../lib/api'
import { MapFilters } from './FilterPanel'

interface GraphLayerProps {
    filters: MapFilters
    onNodeSelect: (node: GraphNode) => void
    selectedEventId?: string
}

// Helper component to render a link with an arrowhead
function LinkWithArrow({ link, sourceNode, targetNode, color, label, weight = 2, opacity = 0.6 }: { link: GraphEdge, sourceNode: GraphNode, targetNode: GraphNode, color: string, label: string, weight?: number, opacity?: number }) {
    const map = useMap()

    // Calculate arrow position and rotation
    const arrowData = useMemo(() => {
        if (!sourceNode.lat || !sourceNode.lon || !targetNode.lat || !targetNode.lon) return null

        const p1 = map.project([sourceNode.lat, sourceNode.lon], map.getZoom())
        const p2 = map.project([targetNode.lat, targetNode.lon], map.getZoom())

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI)

        // Offset the arrow 
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
            <div style="transform: rotate(${arrowData.rotation}deg); width: 0; height: 0; border-top: 4px solid transparent; border-bottom: 4px solid transparent; border-left: 8px solid ${color};"></div>
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
                    color: color,
                    weight: 2,
                    opacity: 0.6,
                    dashArray: link.type === 'NEAR' ? '5, 10' : undefined
                }}
            >
                <Tooltip sticky direction="top" opacity={1}>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 bg-white px-2 py-0.5 rounded shadow border border-indigo-100">
                        {label}
                    </div>
                </Tooltip>
            </Polyline>
            <Marker position={arrowData.pos} icon={arrowIcon} interactive={false} />
        </>
    )
}

export default function GraphLayer({ filters, onNodeSelect, selectedEventId }: GraphLayerProps) {
    const [nodes, setNodes] = useState<GraphNode[]>([])
    const [links, setLinks] = useState<GraphEdge[]>([])
    const map = useMap()

    useEffect(() => {
        const loadGraph = async () => {
            if (!filters.showGraph) return

            try {
                const now = Date.now()
                // Use same time filter logic as EarthquakeMap
                const startTime = filters.timeRangeHours
                    ? Math.floor(now - filters.timeRangeHours * 60 * 60 * 1000)
                    : undefined

                const relationshipTypes: string[] = []
                if (filters.showEpicenters) relationshipTypes.push('EPICENTER_OF')
                if (filters.showAftershocks) relationshipTypes.push('AFTERSHOCK_OF')
                if (filters.showForeshocks) relationshipTypes.push('FORESHOCK_OF')
                if (filters.showTriggered) relationshipTypes.push('TRIGGERED')
                if (filters.showNear) relationshipTypes.push('NEAR')

                const data = await fetchNeo4jGraph({
                    start_time: startTime,
                    min_mag: filters.magnitudeMode === 'minimum' ? filters.magnitudeMin : undefined,
                    max_mag: filters.magnitudeMode === 'range' ? filters.magnitudeMax : undefined,
                    relationship_types: relationshipTypes.length > 0 ? relationshipTypes : undefined
                })

                setNodes(data.nodes)
                setLinks(data.edges)
            } catch (error) {
                console.error("Failed to load graph layer:", error)
            }
        }

        loadGraph()
    }, [filters])

    if (!filters.showGraph) return null

    // Helper to get color by relationship type
    const getEdgeColor = (type: string) => {
        switch (type) {
            case 'EPICENTER_OF': return '#ef4444' // Red
            case 'AFTERSHOCK_OF': return '#f97316' // Orange
            case 'FORESHOCK_OF': return '#eab308' // Yellow
            case 'TRIGGERED': return '#a855f7' // Purple
            case 'NEAR': return '#3b82f6' // Blue
            default: return '#94a3b8' // Slate 400
        }
    }

    const getRelLabel = (type: string) => {
        switch (type) {
            case 'EPICENTER_OF': return 'Epicenter'
            case 'AFTERSHOCK_OF': return 'Aftershock'
            case 'FORESHOCK_OF': return 'Foreshock'
            case 'TRIGGERED': return 'Triggered'
            case 'NEAR': return 'Nearby'
            default: return type.replace(/_/g, ' ')
        }
    }

    // Helper to determine node color/size
    const getNodeStyle = (node: GraphNode) => {
        if (node.label === 'Cluster') return { color: '#10b981', radius: 12, fillOpacity: 0.8 }
        if (node.label === 'City') return { color: '#9333ea', radius: 6, fillOpacity: 0.8 }

        const isState = node.label === 'Region'
        if (isState) {
            return { color: '#64748b', radius: 6, fillOpacity: 0.8 }
        }

        // Event node
        const mag = node.mag || 0
        const color = mag >= 6 ? '#ef4444' : mag >= 5 ? '#f97316' : mag >= 4 ? '#fbbf24' : mag >= 3 ? '#388e3c' : '#3b82f6'
        return { color, radius: Math.max(3, mag * 2), fillOpacity: 0.7 }
    }

    return (
        <LayerGroup>
            {links.map((link, i) => {
                const sourceNode = nodes.find(n => n.id === link.source)
                const targetNode = nodes.find(n => n.id === link.target)

                if (!sourceNode || !targetNode) return null
                if (!sourceNode.lat || !sourceNode.lon || !targetNode.lat || !targetNode.lon) return null

                const isSelected = selectedEventId && (sourceNode.id === selectedEventId || targetNode.id === selectedEventId)

                return (
                    <LinkWithArrow
                        key={`link-${i}`}
                        link={link}
                        sourceNode={sourceNode}
                        targetNode={targetNode}
                        color={isSelected ? '#ef4444' : getEdgeColor(link.type)}
                        label={getRelLabel(link.type)}
                        weight={isSelected ? 4 : 2}
                        opacity={isSelected ? 1 : 0.4}
                    />
                )
            })}

            {nodes.map(node => {
                if (!node.lat || !node.lon) return null

                const style = getNodeStyle(node)

                return (
                    <CircleMarker
                        key={node.id}
                        center={[node.lat, node.lon]}
                        radius={style.radius}
                        pathOptions={{
                            color: '#fff',
                            weight: 1,
                            fillColor: style.color,
                            fillOpacity: style.fillOpacity
                        }}
                        eventHandlers={{
                            click: () => onNodeSelect(node)
                        }}
                    >
                        <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                            <div className="p-2 min-w-[140px]">
                                <div className="font-bold text-sm border-b border-slate-200 pb-1 mb-1">
                                    {node.label === 'Earthquake' ? '🌍 Event' : node.label}
                                </div>
                                <div className="text-xs space-y-0.5">
                                    {node.mag !== undefined && (
                                        <div><span className="text-slate-500">Magnitude:</span> <strong className="text-orange-600">M{node.mag.toFixed(1)}</strong></div>
                                    )}
                                    {node.depth !== undefined && (
                                        <div><span className="text-slate-500">Depth:</span> {node.depth.toFixed(1)} km</div>
                                    )}
                                    {node.place && (
                                        <div><span className="text-slate-500">Location:</span> {node.place}</div>
                                    )}
                                    {node.time && (
                                        <div><span className="text-slate-500">Time:</span> {new Date(node.time).toLocaleString()}</div>
                                    )}
                                    {node.event_count !== undefined && (
                                        <div><span className="text-slate-500">Events:</span> {node.event_count}</div>
                                    )}
                                    {node.avg_mag !== undefined && (
                                        <div><span className="text-slate-500">Avg Mag:</span> M{node.avg_mag.toFixed(1)}</div>
                                    )}
                                    {node.degree !== undefined && (
                                        <div><span className="text-slate-500">Connections:</span> {node.degree}</div>
                                    )}
                                </div>
                            </div>
                        </Tooltip>
                    </CircleMarker>
                )
            })}
        </LayerGroup>
    )
}
