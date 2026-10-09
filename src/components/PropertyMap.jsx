import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, Polygon, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 600);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Custom POI icons using divIcon with emoji + coloured circles
function createPOIIcon(type, impact) {
  const emojiMap = {
    transit: '🚇',
    education: '🏫',
    health: '🏥',
    commercial: '🏢',
    highway: '🛣️',
    other: '📍'
  };
  const colorMap = {
    positive: '#10b981',
    negative: '#ef4444',
    neutral: '#94a3b8'
  };
  const bgColor = colorMap[impact?.direction] || colorMap.neutral;

  return L.divIcon({
    html: `<div style="
      background: ${bgColor};
      width: 28px; height: 28px;
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 14px;
      border: 2px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
    ">${emojiMap[type] || '📍'}</div>`,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -16]
  });
}

export default function PropertyMap({
  showCircleRate,
  showMetro,
  showFlood,
  showImpactFactors = false,
  hyperlocalPOIs = [],
  center = [19.1136, 72.8697]
}) {
  const lat = center[0];
  const lon = center[1];

  const circleRatePolygon = [
    [lat + 0.006, lon - 0.010],
    [lat + 0.006, lon + 0.010],
    [lat - 0.014, lon + 0.010],
    [lat - 0.014, lon - 0.010],
  ];

  const floodPolygon = [
    [lat - 0.004, lon - 0.005],
    [lat + 0.001, lon + 0.005],
    [lat - 0.009, lon + 0.010],
    [lat - 0.014, lon + 0.000],
  ];

  return (
    <div className="w-full h-[400px] rounded-xl overflow-hidden relative border border-slate-200 shadow-inner z-0">
      <MapContainer
        key={center.join(',')}
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ResizeFix />

        <Marker position={center}>
          <Popup><strong>Property Location</strong></Popup>
        </Marker>

        {showMetro && (
          <Circle
            center={center}
            radius={500}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.2, dashArray: '5, 5' }}
          />
        )}

        {showCircleRate && (
          <Polygon
            positions={circleRatePolygon}
            pathOptions={{ color: '#6366f1', fillColor: '#6366f1', fillOpacity: 0.1 }}
          />
        )}

        {showFlood && (
          <Polygon
            positions={floodPolygon}
            pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.2 }}
          />
        )}

        {/* Item 15: Impact Factor POIs */}
        {showImpactFactors && hyperlocalPOIs.map((poi, idx) => (
          <Marker
            key={poi.id || idx}
            position={[poi.lat, poi.lon]}
            icon={createPOIIcon(poi.type, poi.impact)}
          >
            <Popup>
              <div style={{ minWidth: 180, fontFamily: 'system-ui' }}>
                <p style={{ fontWeight: 700, fontSize: 13, margin: '0 0 4px 0', color: '#1e293b' }}>
                  {poi.name}
                </p>
                <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px 0' }}>
                  {poi.type.charAt(0).toUpperCase() + poi.type.slice(1)} · {poi.distance < 1000 ? `${poi.distance}m` : `${(poi.distance / 1000).toFixed(1)}km`}
                </p>
                <div style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 12,
                  fontSize: 10,
                  fontWeight: 700,
                  background: poi.impact?.direction === 'positive' ? '#d1fae5' : poi.impact?.direction === 'negative' ? '#fee2e2' : '#f1f5f9',
                  color: poi.impact?.direction === 'positive' ? '#059669' : poi.impact?.direction === 'negative' ? '#dc2626' : '#64748b'
                }}>
                  {poi.impact?.direction === 'positive' ? '↑' : poi.impact?.direction === 'negative' ? '↓' : '→'} {poi.impact?.label || 'Neutral'}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
