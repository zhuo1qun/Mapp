import { useState, useCallback } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { Note } from '../../types';
import {
  fetchBoundaryGeoJSON,
  searchNominatim,
  type NominatimResult
} from '../../utils/map/overpass';
import { generateId } from '../../utils';

interface UseBorderSearchProps {
  mapInstance: LeafletMap | null;
  notes: Note[];
  onAddNote: (note: Note) => void;
  setBorderGeoJSON: ((data: any) => void) | undefined;
  setShowBorderPanel: ((show: boolean) => void) | undefined;
}

function mapViewbox(mapInstance: LeafletMap | null): string | undefined {
  if (!mapInstance) return undefined;
  try {
    const b = mapInstance.getBounds();
    // Nominatim: left,top,right,bottom = west,north,east,south
    return `${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
  } catch {
    return undefined;
  }
}

export function useBorderSearch({
  mapInstance,
  notes,
  onAddNote,
  setBorderGeoJSON,
  setShowBorderPanel
}: UseBorderSearchProps) {
  const [borderSearchQuery, setBorderSearchQuery] = useState('');
  const [borderSearchResults, setBorderSearchResults] = useState<NominatimResult[]>([]);
  const [isSearchingBorder, setIsSearchingBorder] = useState(false);
  const [borderSearchError, setBorderSearchError] = useState<string | null>(null);
  const [borderSearchMode, setBorderSearchMode] = useState<'region' | 'place'>('region');
  const [pendingPlaceNote, setPendingPlaceNote] = useState<{
    lat: number;
    lng: number;
    name: string;
  } | null>(null);

  const handleBorderSearch = useCallback(async () => {
    if (!borderSearchQuery.trim()) return;

    setIsSearchingBorder(true);
    setBorderSearchError(null);
    setBorderSearchResults([]);

    try {
      const results = await searchNominatim({
        q: borderSearchQuery.trim(),
        mode: borderSearchMode,
        limit: 15,
        viewbox: mapViewbox(mapInstance),
        // 不强制 bounded：当前视野优先，仍允许全球结果
        bounded: false
      });

      if (results.length === 0) {
        setBorderSearchError('No matching results found');
      } else {
        setBorderSearchResults(results);
      }
    } catch (err) {
      console.error('Search failed:', err);
      setBorderSearchError('Search failed, please try again');
    } finally {
      setIsSearchingBorder(false);
    }
  }, [borderSearchQuery, borderSearchMode, mapInstance]);

  const handleSelectBorder = useCallback(
    async (result: NominatimResult) => {
      setIsSearchingBorder(true);
      setBorderSearchError(null);
      try {
        if (borderSearchMode === 'place' || result.osm_type === 'node') {
          const lat = parseFloat(result.lat);
          const lon = parseFloat(result.lon);
          const placeName = result.display_name.split(',')[0];

          if (mapInstance) {
            mapInstance.flyTo([lat, lon], 17, { duration: 1.5 });
          }

          const isDuplicate = notes.some(
            (n) =>
              Math.abs(n.coords.lat - lat) < 0.0001 && Math.abs(n.coords.lng - lon) < 0.0001
          );

          if (!isDuplicate) {
            setPendingPlaceNote({ lat, lng: lon, name: placeName });
          }
        } else {
          const geojson = await fetchBoundaryGeoJSON(result.osm_id, result.osm_type);
          if (!geojson) {
            setBorderSearchError('Failed to fetch details');
            return;
          }
          if (setBorderGeoJSON) {
            setBorderGeoJSON(geojson);
          }

          if (mapInstance) {
            const L = await import('leaflet');
            const layer = L.default.geoJSON(geojson as any);
            mapInstance.fitBounds(layer.getBounds(), { padding: [20, 20], duration: 1.5 });
          }
        }

        if (setShowBorderPanel) setShowBorderPanel(false);
        setBorderSearchResults([]);
        setBorderSearchQuery('');
      } catch (err) {
        console.error('Search interaction failed:', err);
        setBorderSearchError('Failed to fetch details');
      } finally {
        setIsSearchingBorder(false);
      }
    },
    [borderSearchMode, mapInstance, notes, setBorderGeoJSON, setShowBorderPanel]
  );

  const handleConvertPendingToNote = useCallback(() => {
    if (!pendingPlaceNote) return;

    const newNote: Note = {
      id: generateId(),
      coords: { lat: pendingPlaceNote.lat, lng: pendingPlaceNote.lng },
      text: pendingPlaceNote.name,
      emoji: '📍',
      fontSize: 3,
      images: [],
      tags: [],
      variant: 'standard',
      createdAt: Date.now(),
      boardX: 0,
      boardY: 0
    };

    onAddNote(newNote);
    setPendingPlaceNote(null);
  }, [pendingPlaceNote, onAddNote]);

  const handleCopyBorder = useCallback(async (borderGeoJSON: any) => {
    if (!borderGeoJSON) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(borderGeoJSON));
      alert('Border GeoJSON copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy border:', err);
      alert('Failed to copy border to clipboard');
    }
  }, []);

  return {
    borderSearchQuery,
    setBorderSearchQuery,
    borderSearchResults,
    borderSearchError,
    isSearchingBorder,
    borderSearchMode,
    setBorderSearchMode,
    pendingPlaceNote,
    setPendingPlaceNote,
    handleBorderSearch,
    handleSelectBorder,
    handleConvertPendingToNote,
    handleCopyBorder
  };
}
