'use client'

import { useState, useEffect, ReactNode } from 'react'
import Navbar from './Navbar'
import FilterPanel, { MapFilters } from './FilterPanel'
import { fetchNodeNeighbors } from '../lib/api'

interface DashboardLayoutProps {
    children: ReactNode
    filters: MapFilters
    onFilterChange: (filters: MapFilters) => void
    viewMode?: 'map' | 'graph'
    onViewModeChange?: (mode: 'map' | 'graph') => void
    selectedEvent: any | null
    onCloseSelected: () => void
    clusterStats?: {
        totalClusters: number
        totalEventsInClusters: number
        noiseEvents: number
    }
}

export default function DashboardLayout({
    children,
    filters,
    onFilterChange,
    viewMode,
    onViewModeChange,
    selectedEvent,
    onCloseSelected,
    clusterStats
}: DashboardLayoutProps) {
    const [showLeftSidebar, setShowLeftSidebar] = useState(true)
    const [showRightSidebar, setShowRightSidebar] = useState(true)

    // Neighbors State
    const [neighbors, setNeighbors] = useState<any | null>(null)
    const [loadingNeighbors, setLoadingNeighbors] = useState(false)

    // Fetch neighbors when selectedEvent changes
    useEffect(() => {
        if (!selectedEvent?.id) {
            setNeighbors(null)
            return
        }

        const loadNeighbors = async () => {
            setLoadingNeighbors(true)
            try {
                const data = await fetchNodeNeighbors(selectedEvent.id)
                setNeighbors(data)
            } catch (e) {
                console.error("Failed to fetch node neighbors", e)
                setNeighbors(null)
            } finally {
                setLoadingNeighbors(false)
            }
        }
        loadNeighbors()
    }, [selectedEvent?.id])

    return (
        <div className="flex flex-col h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
            <Navbar />

            {/* Top Bar for View Switching */}
            <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4 shrink-0 shadow-sm z-30">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowLeftSidebar(!showLeftSidebar)}
                        className={`p-1.5 rounded-md transition-colors ${showLeftSidebar ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        title="Toggle Filters"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="9" x2="9" y1="3" y2="21" /></svg>
                    </button>
                    <span className="text-sm font-semibold text-slate-600 border-l border-slate-200 pl-3 ml-1">
                        Global Seismic Map
                    </span>
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <div className="px-3 py-1 text-[11px] font-bold text-slate-800 bg-white shadow-sm rounded-md flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                        Live Monitor
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowRightSidebar(!showRightSidebar)}
                        className={`p-1.5 rounded-md transition-colors ${showRightSidebar ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
                        title="Toggle Details"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><line x1="15" x2="15" y1="3" y2="21" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Sidebar: Filters */}
                <aside
                    className={`
            bg-white border-r border-slate-200 flex flex-col transition-all duration-300 ease-in-out z-20 shadow-lg
            ${showLeftSidebar ? 'w-80 translate-x-0' : 'w-0 -translate-x-full opacity-0 pointer-events-none'}
          `}
                >
                    <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                        <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">filters & settings</h2>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                        <FilterPanel initial={filters} onApply={onFilterChange} />

                        {/* Cluster Stats Display - Only if clusters enabled */}
                        {clusterStats && filters.showClusters && (
                            <div className="mt-6 p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">Clustering Analytics</h3>
                                <div className="space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-600 font-medium">Active Clusters</span>
                                        <span className="font-bold text-indigo-600">{clusterStats.totalClusters}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-600 font-medium">Events Clustered</span>
                                        <span className="font-bold text-slate-800">{clusterStats.totalEventsInClusters}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-slate-600 font-medium">Noise (Unclustered)</span>
                                        <span className="font-bold text-slate-500">{clusterStats.noiseEvents}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 relative bg-slate-50 overflow-hidden">
                    {children}
                </main>

                {/* Right Sidebar: Details & Legends */}
                <aside
                    className={`
            bg-white border-l border-slate-200 flex flex-col transition-all duration-300 ease-in-out z-20 shadow-lg
            ${showRightSidebar ? 'w-80 translate-x-0' : 'w-0 translate-x-full opacity-0 pointer-events-none'}
          `}
                >
                    {/* If selected event, show details, else show Legend */}
                    {selectedEvent ? (
                        <div className="flex flex-col h-full animate-in slide-in-from-right duration-300 bg-white">
                            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-indigo-50">
                                <div className="text-xs font-black uppercase tracking-widest text-indigo-600">Selected Event</div>
                                <button onClick={onCloseSelected} className="text-slate-400 hover:text-slate-800 transition-colors">✕</button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 space-y-6">
                                <div>
                                    <div className="text-4xl font-black text-slate-800 mb-1">{selectedEvent.mag || selectedEvent.magnitude}</div>
                                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Magnitude</div>
                                </div>

                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                                    <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Location</div>
                                        <div className="text-sm font-bold text-slate-700">{selectedEvent.place || selectedEvent.label || 'Unknown Location'}</div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Time</div>
                                        <div className="text-sm font-medium text-slate-600">
                                            {selectedEvent.time ? new Date(selectedEvent.time).toLocaleString() : 'N/A'}
                                        </div>
                                    </div>
                                    {selectedEvent.exact_address && (
                                        <div>
                                            <div className="text-[10px] uppercase text-indigo-400 font-bold">Exact Address</div>
                                            <div className="text-xs font-semibold text-indigo-900 bg-indigo-50/50 p-2 rounded-lg border border-indigo-100/50 mt-1">
                                                {selectedEvent.exact_address}
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Coords</div>
                                        <div className="text-sm font-mono text-slate-500">
                                            {selectedEvent.lat || selectedEvent.latitude}, {selectedEvent.lon || selectedEvent.longitude}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[10px] uppercase text-slate-400 font-bold">Depth</div>
                                        <div className="text-sm font-medium text-slate-600">
                                            {selectedEvent.depth} km
                                        </div>
                                    </div>
                                </div>

                                {/* Seismic Context Categories */}
                                {neighbors && neighbors.neighbors.length > 0 && (
                                    <div className="space-y-4 pt-2">
                                        {/* Aftershocks Section */}
                                        {neighbors.neighbors.some((rel: any) => rel.relationship.type === 'AFTERSHOCK_OF' && rel.relationship.direction === 'in') && (
                                            <div>
                                                <div className="text-[10px] uppercase text-orange-500 font-black tracking-widest mb-2 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                                                    Aftershocks
                                                </div>
                                                <div className="space-y-2">
                                                    {neighbors.neighbors
                                                        .filter((rel: any) => rel.relationship.type === 'AFTERSHOCK_OF' && rel.relationship.direction === 'in')
                                                        .map((rel: any, i: number) => (
                                                            <div key={i} className="p-2.5 rounded-lg border border-orange-100 bg-orange-50/30 text-[11px]">
                                                                <div className="font-bold text-orange-800">{rel.node.place || rel.node.title}</div>
                                                                <div className="text-orange-600/80 mt-0.5 font-medium">M{rel.node.mag} • {rel.node.depth}km</div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                <div className="text-[9px] uppercase text-slate-400 font-black mb-1">Fault lines</div>
                                                <div className="text-[11px] font-bold text-red-600">
                                                    {neighbors.neighbors.find((r: any) => r.node.label === 'FaultZone')?.node.name || 'N/A'}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                                                <div className="text-[9px] uppercase text-slate-400 font-black mb-1">Regions</div>
                                                <div className="text-[11px] font-bold text-indigo-600">
                                                    {neighbors.neighbors.find((r: any) => r.node.label === 'Region' || r.node.label === 'State')?.node.name || 'N/A'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Related Events Section */}
                                        <div>
                                            <div className="text-[10px] uppercase text-indigo-400 font-black tracking-widest mb-2">Related Events</div>
                                            <div className="grid grid-cols-1 gap-2">
                                                {neighbors.neighbors
                                                    .filter((rel: any) => ['TRIGGERED', 'NEAR'].includes(rel.relationship.type))
                                                    .map((rel: any, i: number) => (
                                                        <div key={i} className="flex items-center justify-between p-2 bg-white border border-slate-100 rounded-lg shadow-sm">
                                                            <div className="text-[10px] font-bold text-slate-700">{rel.node.place || rel.node.title}</div>
                                                            <div className="text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded font-black">{rel.relationship.type}</div>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* JSON Dump for debugging/extra info */}
                                <div className="pt-6 border-t border-slate-100">
                                    <div className="text-[10px] uppercase text-slate-400 font-bold mb-2">Raw Data</div>
                                    <pre className="text-[9px] font-mono text-slate-400 overflow-x-auto whitespace-pre-wrap break-all bg-slate-50 p-2 rounded border border-slate-100">
                                        {JSON.stringify(selectedEvent, (k, v) => (k === 'source' || k === 'target' || k.startsWith('_') ? undefined : v), 2)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col h-full bg-white">
                            <div className="p-4 border-b border-slate-200 bg-slate-50/50">
                                <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Legend & Info</h2>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1 space-y-8">
                                {viewMode === 'map' ? (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">Magnitude Scale</h3>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#ef4444] shadow-sm ring-1 ring-red-200"></span> <span className="text-slate-500 font-medium">6.0+ Critical</span></div>
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#f97316] shadow-sm ring-1 ring-orange-200"></span> <span className="text-slate-500 font-medium">5.0-5.9 Major</span></div>
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#fbc02d] shadow-sm ring-1 ring-yellow-200"></span> <span className="text-slate-500 font-medium">4.0-4.9 Moderate</span></div>
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#388e3c] shadow-sm ring-1 ring-green-200"></span> <span className="text-slate-500 font-medium">3.0-3.9 Minor</span></div>
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#1976d2] shadow-sm ring-1 ring-blue-200"></span> <span className="text-slate-500 font-medium">&lt; 3.0 Micro</span></div>
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">Map Features</h3>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-3"><span className="w-3 h-3 rounded-full bg-[#9333ea] ring-2 ring-white shadow-sm"></span> <span className="text-slate-500 font-medium">Cluster Center</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-4 rounded bg-gradient-to-r from-blue-500 to-red-500 opacity-50"></span> <span className="text-slate-500 font-medium">Heatmap Zones</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-slate-400"></span> <span className="text-slate-500 font-medium">Graph Connections</span></div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <h3 className="text-xs font-bold text-slate-700 mb-3 uppercase">Relationships</h3>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-[#ef4444]"></span> <span className="text-slate-500 font-medium">Epicenter Of</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-[#f97316]"></span> <span className="text-slate-500 font-medium">Aftershock Of</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-[#eab308]"></span> <span className="text-slate-500 font-medium">Foreshock Of</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-[#a855f7]"></span> <span className="text-slate-500 font-medium">Triggered</span></div>
                                                <div className="flex items-center gap-3"><span className="w-4 h-0.5 bg-[#3b82f6]"></span> <span className="text-slate-500 font-medium">Nearby (Spatial)</span></div>
                                            </div>
                                        </div>
                                        <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-100 text-center">
                                            <div className="text-indigo-600 text-[10px] font-bold uppercase mb-2">Interaction Tips</div>
                                            <p className="text-[10px] text-slate-500">
                                                Hover over nodes for quick stats.<br />
                                                Click nodes to see full details here.<br />
                                                Drag background to pan.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </aside>
            </div>
        </div>
    )
}
