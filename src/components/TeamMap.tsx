// TeamMap — แผนที่ Leaflet แสดงตำแหน่งทีม, SOS และเส้นทางย้อนหลัง
import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Alert, Location } from '../lib/api';
import { initials } from './ui';

const FRESH_MS = 10 * 60 * 1000;
const brandColor = () => `rgb(${getComputedStyle(document.documentElement).getPropertyValue('--brand-500').trim()})`;

function userIcon(loc: Location, online: boolean, selected: boolean) {
  const stale = Date.now() - loc.at > FRESH_MS;
  const color = !online ? '#94a3b8' : stale ? '#f59e0b' : brandColor();
  return L.divIcon({
    className: '',
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<div style="width:36px;height:36px;border-radius:9999px;background:${color};color:#fff;font:600 12px sans-serif;
      display:flex;align-items:center;justify-content:center;overflow:hidden;border:3px solid ${selected ? '#0f172a' : '#fff'};box-shadow:0 2px 6px rgba(0,0,0,.35)">
      ${loc.avatar ? `<img src="${encodeURI(loc.avatar)}" style="width:100%;height:100%;border-radius:9999px;object-fit:cover" alt="">` : initials(loc.displayName).replace(/</g, '&lt;')}</div>`,
  });
}

const sosIcon = L.divIcon({
  className: '',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  html: `<div style="width:44px;height:44px;border-radius:9999px;background:#dc2626;color:#fff;font:900 11px sans-serif;display:flex;
    align-items:center;justify-content:center;border:3px solid #fff;box-shadow:0 0 0 6px rgba(220,38,38,.35)" class="animate-pulse">SOS</div>`,
});

interface Props {
  locations: Location[];
  online: Record<number, string>;
  alerts: Alert[];
  selectedId: number | null;
  track: { lat: number; lng: number }[] | null;
  onSelect: (userId: number) => void;
  className?: string;
}

const TeamMap: React.FC<Props> = ({ locations, online, alerts, selectedId, track, onSelect, className = '' }) => {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const trackLayer = useRef<L.LayerGroup | null>(null);
  const fitted = useRef(false);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView([13.7563, 100.5018], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    trackLayer.current = L.layerGroup().addTo(m);
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    for (const loc of locations) {
      L.marker([loc.lat, loc.lng], { icon: userIcon(loc, !!online[loc.userId], loc.userId === selectedId), zIndexOffset: loc.userId === selectedId ? 1000 : 0 })
        .on('click', () => onSelect(loc.userId))
        .bindTooltip(loc.displayName, { direction: 'top', offset: [0, -18] })
        .addTo(g);
      if (loc.acc && loc.acc < 2000 && loc.userId === selectedId) {
        L.circle([loc.lat, loc.lng], { radius: loc.acc, color: brandColor(), weight: 1, fillOpacity: 0.08 }).addTo(g);
      }
    }
    for (const a of alerts) {
      if (a.lat == null || a.lng == null) continue;
      L.marker([a.lat, a.lng], { icon: sosIcon, zIndexOffset: 2000 }).bindTooltip(`SOS: ${a.username}`, { direction: 'top' }).addTo(g);
    }
    if (!fitted.current) {
      const pts: L.LatLngExpression[] = [...locations.map((l) => [l.lat, l.lng] as [number, number]), ...alerts.filter((a) => a.lat != null).map((a) => [a.lat!, a.lng!] as [number, number])];
      if (pts.length) {
        m.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
        fitted.current = true;
      }
    }
  }, [locations, online, alerts, selectedId, onSelect]);

  // เลื่อนไปยังคนที่เลือก
  useEffect(() => {
    const loc = locations.find((l) => l.userId === selectedId);
    if (loc && map.current) map.current.setView([loc.lat, loc.lng], Math.max(map.current.getZoom(), 15), { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => {
    const g = trackLayer.current;
    if (!g || !map.current) return;
    g.clearLayers();
    if (track && track.length > 1) {
      const line = L.polyline(track.map((p) => [p.lat, p.lng] as [number, number]), { color: '#6366f1', weight: 4, opacity: 0.8 }).addTo(g);
      L.circleMarker([track[0].lat, track[0].lng], { radius: 6, color: '#6366f1', fillOpacity: 1 }).bindTooltip('จุดเริ่ม').addTo(g);
      map.current.fitBounds(line.getBounds(), { padding: [40, 40] });
    }
  }, [track]);

  return <div ref={el} className={`z-0 ${className}`} />;
};

export default TeamMap;
