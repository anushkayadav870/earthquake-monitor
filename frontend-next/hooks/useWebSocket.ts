"use client"

import { useEffect, useRef } from 'react'

export default function useWebSocket(onMessage: (msg: any) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)

  useEffect(() => {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'
    let shouldStop = false
    let reconnectAttempts = 0

    const connect = () => {
      if (shouldStop) return

      try {
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          console.log('WebSocket connected', wsUrl)
          reconnectAttempts = 0
        }

        ws.onmessage = (ev) => {
          onMessage(ev.data)
        }

        ws.onclose = () => {
          console.log('WebSocket closed')
          if (shouldStop) return

          // Exponential backoff with cap
          const timeout = Math.min(30000, Math.pow(2, reconnectAttempts) * 1000)
          reconnectAttempts += 1
          reconnectRef.current = window.setTimeout(() => {
            connect()
          }, timeout)
        }

        ws.onerror = (e) => {
          console.error('WebSocket error', e)
          try {
            ws.close()
          } catch (err) {}
        }
      } catch (e) {
        console.error('Failed to create WebSocket', e)
        // Try reconnect if initial connection failed
        reconnectRef.current = window.setTimeout(() => {
          if (!shouldStop) connect()
        }, 2000)
      }
    }

    // Start connection
    connect()

    return () => {
      shouldStop = true
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
      }
      try {
        wsRef.current?.close()
      } catch (e) {
        /* ignore */
      }
    }
  }, [onMessage])
}
