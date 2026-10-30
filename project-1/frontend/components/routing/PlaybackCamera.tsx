"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

import type { SearchResult } from "@/types/routing";

export function PlaybackCamera({
  result,
  playbackStep,
  enabled = true,
  targetZoom = 16,
}: {
  result: SearchResult;
  playbackStep: number;
  enabled?: boolean;
  targetZoom?: number;
}) {
  const map = useMap();
  const framedResult = useRef<SearchResult | null>(null);
  const completedResult = useRef<SearchResult | null>(null);

  useEffect(() => {
    if (playbackStep <= 0) {
      framedResult.current = null;
      completedResult.current = null;
      return;
    }
    if (!enabled) {
      framedResult.current = null;
      return;
    }

    const expandedCount = result.expanded_nodes.length;
    const totalSteps = expandedCount + result.path.length;
    if (playbackStep >= totalSteps) {
      if (completedResult.current !== result) {
        const completedNodes = result.path.length > 1
          ? result.path
          : result.expanded_nodes;
        const frameCompletedSearch = () => {
          map.invalidateSize({ pan: false });
          if (completedNodes.length === 1) {
            map.setView([completedNodes[0].lat, completedNodes[0].lng], targetZoom, { animate: false });
          } else if (completedNodes.length > 1) {
            map.fitBounds(completedNodes.map((point) => [point.lat, point.lng]), {
              padding: [24, 24],
              maxZoom: targetZoom,
              animate: false,
            });
            map.setZoom(Math.min(map.getZoom() + 1, targetZoom), { animate: false });
          }
        };
        window.requestAnimationFrame(frameCompletedSearch);
        window.setTimeout(frameCompletedSearch, 180);
        completedResult.current = result;
      }
      return;
    }

    if (framedResult.current === result) return;
    const nodes = result.expanded_nodes.length ? result.expanded_nodes : result.path;
    if (nodes.length === 1) {
      map.setView([nodes[0].lat, nodes[0].lng], targetZoom, { animate: false });
    } else if (nodes.length > 1) {
      map.fitBounds(nodes.map((point) => [point.lat, point.lng]), {
        padding: [36, 36],
        maxZoom: targetZoom,
        animate: false,
      });
    }
    framedResult.current = result;
  }, [enabled, map, playbackStep, result, targetZoom]);

  return null;
}
