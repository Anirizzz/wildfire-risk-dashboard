import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  ScatterChart,
  Scatter,
} from 'recharts';

const API_BASE = '';

const REGIONS = ['Global', 'India', 'USA', 'Australia', 'Brazil'];
const RISK_LEVELS = ['Low', 'Medium', 'High'];
const RISK_COLORS = { Low: '#2dd4bf', Medium: '#f59e0b', High: '#ef4444' };

const TABS = [
  { id: 'overview', icon: '🌍', label: 'Overview' },
  { id: 'methodology', icon: '📝', label: 'Methodology' },
  { id: 'analytics', icon: '📊', label: 'Analytics' },
  { id: 'risk', icon: '🧠', label: 'Risk Assessment' },
  { id: 'temporal', icon: '⏳', label: 'Temporal Analysis' },
  { id: 'alerts', icon: '🚨', label: 'Alerts & Decision Support' },
  { id: 'satellite', icon: '🛰️', label: 'Satellite Comparison' },
  { id: 'prediction', icon: '🔮', label: 'Prediction vs Detection' },
  { id: 'advanced', icon: '🔥', label: 'Advanced Capabilities' },
  { id: 'table', icon: '📋', label: 'Data Table' },
];

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function metricTone(summary) {
  if ((summary?.highRisk ?? 0) > 0) return 'critical';
  if ((summary?.mediumRisk ?? 0) > 0) return 'warning';
  return 'safe';
}

function HeatmapComponent({ mapPoints }) {
  const map = useMap();
  const heatLayerRef = useRef(null);

  useEffect(() => {
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    if (!mapPoints || mapPoints.length === 0) {
      return;
    }

    // Prepare heatmap data: [lat, lon, intensity (0-1)]
    const heatData = mapPoints.map((p) => [
      p.latitude,
      p.longitude,
      Math.min(1, p.radius / 22),
    ]);

    // If the plugin failed to load, skip heatmap gracefully.
    if (typeof L.heatLayer !== 'function') {
      return;
    }

    try {
      heatLayerRef.current = L.heatLayer(heatData, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: {
          0.0: '#0099ff',
          0.25: '#00ffff',
          0.5: '#ffff00',
          0.75: '#ff6633',
          1.0: '#ff0000',
        },
      });

      heatLayerRef.current.addTo(map);
    } catch {
      heatLayerRef.current = null;
    }

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [mapPoints, map]);

  return null;
}

function App() {
  const [region, setRegion] = useState('Global');
  const [selectedRisks, setSelectedRisks] = useState(['Low', 'Medium', 'High']);
  const [minFrp, setMinFrp] = useState(0);
  const [minConfidence, setMinConfidence] = useState(0);
  const [limit, setLimit] = useState(1500);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefresh, setLastRefresh] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [enableHeatmap, setEnableHeatmap] = useState(false);

  const risksQuery = useMemo(() => selectedRisks.join(','), [selectedRisks]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadDashboard() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          region,
          risks: risksQuery,
          min_frp: String(minFrp),
          min_confidence: String(minConfidence),
          limit: String(limit),
        });

        const response = await fetch(`${API_BASE}/api/dashboard?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`API request failed with ${response.status}`);
        }

        const data = await response.json();
        setPayload(data);
        setLastRefresh(new Date());
      } catch (fetchError) {
        if (fetchError.name !== 'AbortError') {
          setError(fetchError.message || 'Unable to load wildfire dashboard.');
        }
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();

    return () => controller.abort();
  }, [region, risksQuery, minFrp, minConfidence, limit]);

  const summary = payload?.summary ?? {};
  const riskTone = metricTone(summary);

  return (
    <div className="app-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <header className="hero card">
        <div className="hero-copy">
          <div className="eyebrow">NASA FIRMS + Random Forest</div>
          <h1>Global Wildfire Risk Monitoring System</h1>
          <p>
            Near real-time satellite detection and ML-based risk classification using MODIS + VIIRS from NASA FIRMS
          </p>
          <div className={`status-pill ${riskTone}`}>
            <span className="status-dot" />
            {payload ? `Live feed active for ${payload.region}` : 'Connecting to backend'}
          </div>
        </div>

        <div className="hero-metrics">
          <div className="hero-card accent-red">
            <span>High Risk</span>
            <strong>{formatNumber(summary.highRisk)}</strong>
          </div>
          <div className="hero-card accent-amber">
            <span>Medium Risk</span>
            <strong>{formatNumber(summary.mediumRisk)}</strong>
          </div>
          <div className="hero-card accent-teal">
            <span>Total Detections</span>
            <strong>{formatNumber(summary.totalDetections)}</strong>
          </div>
        </div>
      </header>

      <section className="controls card">
        <div className="control-group">
          <label>Region</label>
          <select value={region} onChange={(event) => setRegion(event.target.value)}>
            {REGIONS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <label>Risk Levels</label>
          <div className="chip-row">
            {RISK_LEVELS.map((risk) => (
              <button
                key={risk}
                className={`chip ${selectedRisks.includes(risk) ? 'active' : ''}`}
                onClick={() => {
                  setSelectedRisks((current) => (
                    current.includes(risk)
                      ? current.filter((entry) => entry !== risk)
                      : [...current, risk]
                  ));
                }}
                type="button"
              >
                {risk}
              </button>
            ))}
          </div>
        </div>

        <div className="control-group slider-group">
          <label>Min FRP: {minFrp}</label>
          <input type="range" min="0" max="500" value={minFrp} onChange={(event) => setMinFrp(Number(event.target.value))} />
        </div>

        <div className="control-group slider-group">
          <label>Min Confidence: {minConfidence}</label>
          <input type="range" min="0" max="100" value={minConfidence} onChange={(event) => setMinConfidence(Number(event.target.value))} />
        </div>

        <div className="control-group slider-group">
          <label>Rows: {limit}</label>
          <input type="range" min="50" max="2000" step="50" value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
        </div>
      </section>

      {error && (
        <section className="card error-banner">
          <strong>Backend unavailable.</strong>
          <span>{error}</span>
        </section>
      )}

      <section className="tabs-header">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`tab-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </section>

      {loading && !payload ? (
        <section className="card loading-card">Loading wildfire intelligence...</section>
      ) : payload ? (
        <main className="tab-content">
          {activeTab === 'overview' && <TabOverview payload={payload} riskTone={riskTone} summary={summary} enableHeatmap={enableHeatmap} setEnableHeatmap={setEnableHeatmap} />}
          {activeTab === 'methodology' && <TabMethodology />}
          {activeTab === 'analytics' && <TabAnalytics payload={payload} />}
          {activeTab === 'risk' && <TabRisk payload={payload} summary={summary} />}
          {activeTab === 'temporal' && <TabTemporal payload={payload} />}
          {activeTab === 'alerts' && <TabAlerts payload={payload} summary={summary} />}
          {activeTab === 'satellite' && <TabSatellite payload={payload} />}
          {activeTab === 'prediction' && <TabPrediction />}
          {activeTab === 'advanced' && <TabAdvanced />}
          {activeTab === 'table' && <TabTable payload={payload} />}
        </main>
      ) : null}
    </div>
  );
}

// ============= TAB COMPONENTS =============

function TabOverview({ payload, riskTone, summary, enableHeatmap, setEnableHeatmap }) {
  return (
    <div className="tab-panel">
      <section className="card metric-grid">
        <Metric label="Total detections" value={summary.totalDetections} tone={riskTone} />
        <Metric label="High risk" value={summary.highRisk} tone="critical" />
        <Metric label="Medium risk" value={summary.mediumRisk} tone="warning" />
        <Metric label="Avg risk score" value={summary.avgRiskScore?.toFixed?.(1) ?? 0} tone="safe" />
      </section>

      <section className="card map-overview">
        <div className="panel-header">
          <div>
            <h2>🌍 Global Wildfire Overview</h2>
            <p>Live satellite detection map with FRP-weighted markers and risk classification</p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#94a3b8' }}>
              <input 
                type="checkbox" 
                checked={enableHeatmap} 
                onChange={(e) => setEnableHeatmap(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Enable Heatmap
            </label>
            <div className={`badge ${riskTone}`}>{payload.generatedAtIst} IST</div>
          </div>
        </div>

        <div className="map-frame large">
          <MapContainer center={[20, 0]} zoom={2} scrollWheelZoom className="leaflet-map">
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {enableHeatmap && payload.mapPoints.length > 0 && (
              <HeatmapComponent mapPoints={payload.mapPoints} />
            )}

            {payload.mapPoints.map((point, index) => (
              <CircleMarker
                key={`${point.latitude}-${point.longitude}-${index}`}
                center={[point.latitude, point.longitude]}
                radius={point.radius}
                pathOptions={{
                  color: point.color,
                  fillColor: point.color,
                  fillOpacity: 0.6,
                  weight: 2.5,
                }}
              >
                <Popup className="popup-custom">
                  <div>
                    <strong style={{ color: point.color }}>{point.label} Risk</strong><br />
                    Satellite: <strong>{point.satellite}</strong><br />
                    FRP: <strong>{point.frp.toFixed(2)} MW</strong><br />
                    Confidence: <strong>{point.confidence.toFixed(0)}%</strong><br />
                    Time: <strong>{point.datetimeIst}</strong><br />
                    Location: <strong>{point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}</strong>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
          <strong>Legend:</strong> Green = Low Risk | Orange = Medium Risk | Red = High Risk | Circle size = FRP intensity
        </div>
      </section>
    </div>
  );
}

function TabAnalytics({ payload }) {
  return (
    <div className="tab-panel">
      <section className="card">
        <PanelTitle title="📊 Risk Level Distribution" subtitle="Breakdown of detections by predicted risk class" />
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={payload.riskDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="label" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Bar dataKey="count" radius={[12, 12, 0, 0]}>
              {payload.riskDistribution.map((entry) => (
                <Cell key={entry.label} fill={RISK_COLORS[entry.label] || '#60a5fa'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <PanelTitle title="⏱️ Detections by Hour (UTC)" subtitle="Satellite overpass patterns in UTC timezone" />
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={payload.hourlyUtc}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="hour" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Area type="monotone" dataKey="count" fill="#f97316" stroke="#f97316" fillOpacity={0.4} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <PanelTitle title="⏱️ Detections by Hour (IST)" subtitle="Satellite overpass patterns in IST timezone" />
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={payload.hourlyIst}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="hour" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Area type="monotone" dataKey="count" fill="#14b8a6" stroke="#14b8a6" fillOpacity={0.4} />
          </AreaChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <p style={{ color: '#94a3b8', lineHeight: '1.8' }}>
          <strong>Note:</strong> Hourly spikes correspond to MODIS and VIIRS satellite overpass times, not actual fire ignition times.
          MODIS overpasses typically occur around 10:30 AM and 10:30 PM UTC, while VIIRS has different orbital characteristics.
        </p>
      </section>
    </div>
  );
}

function TabRisk({ payload, summary }) {
  return (
    <div className="tab-panel">
      <section className="card">
        <div className="panel-header">
          <div>
            <h2>🧠 Wildfire Risk Assessment Dashboard</h2>
            <p>ML-based risk scoring combines Fire Radiative Power and detection confidence</p>
          </div>
        </div>

        <div style={{ marginTop: '18px' }}>
          {summary.maxRiskScore >= 70 ? (
            <div className="status-alert critical">🔴 OVERALL STATUS: HIGH WILDFIRE RISK</div>
          ) : summary.maxRiskScore >= 40 ? (
            <div className="status-alert warning">🟠 OVERALL STATUS: MODERATE WILDFIRE RISK</div>
          ) : (
            <div className="status-alert safe">🟢 OVERALL STATUS: LOW WILDFIRE RISK</div>
          )}
        </div>

        <div className="metrics-grid-large">
          <div className="stat-card">
            <span>Average Risk Score</span>
            <strong>{summary.avgRiskScore?.toFixed?.(1) ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>95th Percentile</span>
            <strong>{summary.p95RiskScore?.toFixed?.(1) ?? 0}</strong>
          </div>
          <div className="stat-card">
            <span>Maximum Risk Score</span>
            <strong>{summary.maxRiskScore?.toFixed?.(1) ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <PanelTitle title="📈 Risk Score Distribution" subtitle="Distribution (0-100) of computed wildfire risk scores" />
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={payload.riskDistribution}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="label" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Bar dataKey="count" fill="#38bdf8" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <PanelTitle title="🔥 Top High-Risk Fire Events" subtitle="Critical detections ranked by risk score" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Satellite</th>
                <th>FRP (MW)</th>
                <th>Confidence</th>
                <th>Risk Score</th>
                <th>Time IST</th>
                <th>Lat / Lon</th>
              </tr>
            </thead>
            <tbody>
              {payload.highRiskEvents.slice(0, 10).map((row, index) => (
                <tr key={index}>
                  <td>{row.satellite}</td>
                  <td>{Number(row.frp).toFixed(2)}</td>
                  <td>{Number(row.confidence ?? 0).toFixed(0)}%</td>
                  <td><strong style={{ color: '#fbbf24' }}>{Number(row.risk_score ?? 0).toFixed(1)}</strong></td>
                  <td>{row.datetime_ist}</td>
                  <td>{Number(row.latitude).toFixed(2)} / {Number(row.longitude).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <p style={{ color: '#94a3b8', lineHeight: '1.8' }}>
          <strong>Risk Score Formula:</strong> (FRP / MAX_FRP × 70%) + (Confidence / 100 × 30%), clamped to 0-100.
          This composite index prioritizes high radiative power while accounting for detection confidence.
        </p>
      </section>
    </div>
  );
}

function TabTemporal({ payload }) {
  return (
    <div className="tab-panel">
      <section className="card">
        <PanelTitle title="⏳ Temporal Analysis" subtitle="Time-series view of wildfire activity patterns" />
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={payload.hourlyIst}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="hour" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Line type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <PanelTitle title="Hourly Comparison" subtitle="UTC vs IST satellite overpass times" />
        <ResponsiveContainer width="100%" height={350}>
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="hour" stroke="#9ca3af" allowDuplicatedCategory={false} />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Line name="UTC" data={payload.hourlyUtc} type="monotone" dataKey="count" stroke="#f97316" strokeWidth={2.5} />
            <Line name="IST" data={payload.hourlyIst} type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={2.5} />
          </LineChart>
        </ResponsiveContainer>
      </section>
    </div>
  );
}

function TabAlerts({ payload, summary }) {
  const highRisk = summary.highRisk || 0;
  const mediumRisk = summary.mediumRisk || 0;

  return (
    <div className="tab-panel">
      <section className="card">
        <h2>🚨 Alerts & Decision Support Dashboard</h2>

        {highRisk > 0 ? (
          <div className="status-alert critical">
            🚨 CRITICAL ALERT: {highRisk} HIGH RISK EVENTS DETECTED
          </div>
        ) : mediumRisk > 0 ? (
          <div className="status-alert warning">
            ⚠️ MODERATE ALERT: {mediumRisk} MEDIUM RISK EVENTS DETECTED
          </div>
        ) : (
          <div className="status-alert safe">
            ✅ SAFE STATUS: No high-risk wildfire events detected
          </div>
        )}

        <div className="metrics-grid-large">
          <div className="stat-card">
            <span>Total Events</span>
            <strong>{summary.totalDetections}</strong>
          </div>
          <div className="stat-card accent-red">
            <span>High Risk</span>
            <strong>{summary.highRisk}</strong>
          </div>
          <div className="stat-card accent-amber">
            <span>Medium Risk</span>
            <strong>{summary.mediumRisk}</strong>
          </div>
          <div className="stat-card accent-teal">
            <span>Low Risk</span>
            <strong>{summary.lowRisk}</strong>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>🧠 Decision Support Recommendations</h3>
        
        {highRisk > 0 ? (
          <AlertBlock 
            tone="critical" 
            title="🔴 Immediate Action Recommended" 
            body="Activate wildfire response teams immediately. Notify all relevant disaster management authorities. Monitor affected regions continuously. Restrict public access and activities in vulnerable zones. Coordinate with satellite operators for enhanced monitoring."
          />
        ) : mediumRisk > 0 ? (
          <AlertBlock 
            tone="warning" 
            title="🟠 Preparedness Advisory" 
            body="Increase monitoring frequency to hourly intervals. Alert local authorities and emergency coordinators. Prepare regional response units for rapid escalation. Position resources in high-risk areas. Ready evacuation protocols if conditions deteriorate."
          />
        ) : (
          <AlertBlock 
            tone="safe" 
            title="🟢 Normal Monitoring" 
            body="Continue routine surveillance with standard reporting intervals. No immediate escalation required. Maintain normal operational readiness. File regular status updates to relevant authorities."
          />
        )}
      </section>

      <section className="card">
        <PanelTitle title="🔥 Top Critical Fire Events" subtitle="Ranked by detected risk scores" />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Satellite</th>
                <th>FRP (MW)</th>
                <th>Confidence</th>
                <th>Time IST</th>
                <th>Location</th>
              </tr>
            </thead>
            <tbody>
              {payload.highRiskEvents.slice(0, 12).map((row, index) => (
                <tr key={index}>
                  <td>{row.satellite}</td>
                  <td><strong>{Number(row.frp).toFixed(2)}</strong></td>
                  <td>{Number(row.confidence ?? 0).toFixed(0)}%</td>
                  <td>{row.datetime_ist}</td>
                  <td>{Number(row.latitude).toFixed(2)}, {Number(row.longitude).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TabSatellite({ payload }) {
  return (
    <div className="tab-panel">
      <section className="card">
        <h2>🛰️ Satellite Detection Comparison (MODIS vs VIIRS)</h2>

        <div className="metrics-grid-large">
          {payload.satelliteCounts.map((sat, idx) => (
            <div key={sat.satellite} className="stat-card">
              <span>{sat.satellite} Detections</span>
              <strong>{formatNumber(sat.count)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <PanelTitle title="📊 Detection Count by Satellite" subtitle="MODIS vs VIIRS sensor performance" />
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={payload.satelliteCounts}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.12)" />
            <XAxis dataKey="satellite" stroke="#9ca3af" />
            <YAxis stroke="#9ca3af" />
            <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.08)' }} />
            <Bar dataKey="count" fill="#06b6d4" radius={[12, 12, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="card">
        <h3>📡 Sensor Characteristics</h3>
        <div className="info-grid">
          <div className="info-card">
            <strong>MODIS (1 km)</strong><br/>
            Spatial resolution: 1 km<br/>
            Temporal: ~10:30 AM/PM UTC<br/>
            Higher FRP detection threshold
          </div>
          <div className="info-card">
            <strong>VIIRS (375 m)</strong><br/>
            Spatial resolution: 375 m<br/>
            Temporal: Multiple daily passes<br/>
            Lower FRP, finer detail detection
          </div>
        </div>
      </section>

      <section className="card">
        <p style={{ color: '#94a3b8', lineHeight: '1.8' }}>
          <strong>Note:</strong> VIIRS typically reports more detections due to higher spatial resolution (375m vs 1km), 
          but MODIS often reports stronger fire signals. Fusion of both sources provides comprehensive coverage.
        </p>
      </section>
    </div>
  );
}

function TabPrediction() {
  return (
    <div className="tab-panel">
      <section className="card">
        <h2>🔮 Prediction vs Detection</h2>
        
        <div style={{ marginTop: '20px' }}>
          <h3>Detection (Satellite Observed)</h3>
          <p style={{ color: '#94a3b8' }}>
            Raw measurements from NASA FIRMS MODIS and VIIRS instruments.
            These are actual thermal anomalies detected by satellites, reported as Fire Radiative Power (FRP).
          </p>

          <h3 style={{ marginTop: '20px' }}>Prediction (ML Risk Classification)</h3>
          <p style={{ color: '#94a3b8' }}>
            Random Forest classifier scores detections into three risk classes:
          </p>
          <ul style={{ color: '#94a3b8', paddingLeft: '20px' }}>
            <li><strong>Low Risk:</strong> Potential false alarms, agricultural fires, or smaller controlled burns</li>
            <li><strong>Medium Risk:</strong> Moderate intensity fires requiring monitoring</li>
            <li><strong>High Risk:</strong> Severe wildfire events requiring immediate intervention</li>
          </ul>

          <h3 style={{ marginTop: '20px' }}>Risk Score Calculation</h3>
          <pre style={{
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(148, 163, 184, 0.14)',
            overflow: 'auto',
            color: '#14b8a6'
          }}>
{`Risk Score = (FRP_normalized × 0.70) + (Confidence × 0.30)
             where FRP_normalized = FRP / MAX_FRP_in_region`}
          </pre>
        </div>
      </section>
    </div>
  );
}

function TabAdvanced() {
  return (
    <div className="tab-panel">
      <section className="card">
        <h2>🔥 Advanced System Capabilities</h2>

        <div className="features-grid">
          <div className="feature-card">
            <h4>🌡️ Heatmap-Based Intensity</h4>
            <p>FRP-weighted spatial density representation for wildfire intensity clustering</p>
          </div>

          <div className="feature-card">
            <h4>🌍 Region-Based Filtering</h4>
            <p>Bounding-box geographic filtering for country-level and regional analysis</p>
          </div>

          <div className="feature-card">
            <h4>📡 MODIS + VIIRS Fusion</h4>
            <p>Dual-sensor integration for enhanced detection resolution and coverage</p>
          </div>

          <div className="feature-card">
            <h4>⏱️ Near Real-Time</h4>
            <p>Data refreshes every 15 minutes with latest NASA FIRMS satellite feeds</p>
          </div>

          <div className="feature-card">
            <h4>🤖 Random Forest ML</h4>
            <p>Supervised classification with 3-class risk stratification</p>
          </div>

          <div className="feature-card">
            <h4>☁️ Cloud Deployable</h4>
            <p>FastAPI backend + React frontend for easy cloud hosting</p>
          </div>
        </div>

        <section style={{ marginTop: '30px' }}>
          <h3>Project Architecture</h3>
          <p style={{ color: '#94a3b8', marginBottom: '12px' }}>
            <strong>Backend:</strong> FastAPI server loads pre-trained Random Forest model, fetches real-time NASA FIRMS data,
            applies feature engineering, and returns prediction payloads as JSON.
          </p>
          <p style={{ color: '#94a3b8', marginBottom: '12px' }}>
            <strong>Frontend:</strong> React + Vite dashboard with Leaflet maps, Recharts visualizations, and responsive controls
            for real-time filtering and exploration.
          </p>
          <p style={{ color: '#94a3b8' }}>
            <strong>Data:</strong> NASA FIRMS MODIS C6.1 and VIIRS SNPP global active fire data, updated hourly.
          </p>
        </section>
      </section>
    </div>
  );
}

function TabMethodology() {
  return (
    <div className="tab-panel">
      <section className="card">
        <h2>📝 Project Methodology & Research</h2>
        <p style={{ color: '#94a3b8' }}>
          This year-long project explores the integration of remote sensing data with supervised machine learning 
          to provide near real-time wildfire risk intelligence.
        </p>
      </section>

      <div className="dashboard-grid">
        <section className="card" style={{ gridColumn: 'span 6' }}>
          <h3>🛰️ Data Acquisition (NASA FIRMS)</h3>
          <p>
            The system aggregates thermal anomaly data from two primary satellite constellations:
          </p>
          <ul style={{ marginTop: '12px' }}>
            <li><strong>MODIS (Aqua/Terra)</strong>: Focuses on larger, high-intensity thermal signatures at 1km resolution.</li>
            <li><strong>VIIRS (SNPP/NOAA-20)</strong>: Provides 375m high-resolution detection, capable of identifying smaller fire fronts and night-time activity.</li>
          </ul>
          <p style={{ marginTop: '12px' }}>
            Data is ingested via NASA's global 24h CSV feeds, ensuring that the dashboard reflects the most recent orbital overpasses.
          </p>
        </section>

        <section className="card" style={{ gridColumn: 'span 6' }}>
          <h3>🤖 Machine Learning Architecture</h3>
          <p>
            The core prediction engine uses a <strong>Random Forest Classifier</strong>. 
            This ensemble method was chosen for its robustness against sensor noise and its ability 
            to provide feature importance rankings.
          </p>
          <ul style={{ marginTop: '12px' }}>
            <li><strong>Training Set</strong>: Historical wildfire labels categorized by intensity.</li>
            <li><strong>Input Features</strong>: Latitude, Longitude, FRP (MW), Brightness (K), Scan/Track, and Temporal hour.</li>
            <li><strong>Output</strong>: 3-class risk stratification (Low, Medium, High).</li>
          </ul>
        </section>

        <section className="card" style={{ gridColumn: 'span 12' }}>
          <h3>⚖️ Risk Scoring & Decision Logic</h3>
          <p>
            Beyond classification, the system computes a continuous <strong>Risk Score (0-100)</strong> to prioritize response:
          </p>
          <pre style={{
            background: 'rgba(0, 0, 0, 0.2)',
            padding: '16px',
            borderRadius: '12px',
            marginTop: '12px',
            color: '#14b8a6',
            fontFamily: 'monospace'
          }}>
            Score = (FRP / Global_Max_FRP * 70) + (Detection_Confidence * 0.3)
          </pre>
          <p style={{ marginTop: '12px' }}>
            This allows authorities to distinguish between smaller agricultural burns and high-risk forest wildfires 
            that threaten infrastructure.
          </p>
        </section>
      </div>
    </div>
  );
}

function TabTable({ payload }) {
  return (
    <div className="tab-panel">
      <section className="card">
        <h2>📋 Data Table</h2>
        <p style={{ color: '#94a3b8', marginBottom: '16px' }}>
          Detailed listing of recent {payload.recentDetections.length} detections after filtering
        </p>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Risk</th>
                <th>Satellite</th>
                <th>FRP (MW)</th>
                <th>Confidence</th>
                <th>Brightness</th>
                <th>Time IST</th>
                <th>Latitude</th>
                <th>Longitude</th>
              </tr>
            </thead>
            <tbody>
              {payload.recentDetections.map((row, index) => (
                <tr key={index}>
                  <td><span className={`table-pill ${String(row.risk_label).toLowerCase()}`}>{row.risk_label}</span></td>
                  <td>{row.satellite}</td>
                  <td>{Number(row.frp).toFixed(2)}</td>
                  <td>{Number(row.confidence ?? 0).toFixed(0)}%</td>
                  <td>{Number(row.brightness ?? 0).toFixed(1)}</td>
                  <td style={{ fontSize: '0.85rem' }}>{row.datetime_ist}</td>
                  <td>{Number(row.latitude).toFixed(4)}</td>
                  <td>{Number(row.longitude).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

// ============= HELPER COMPONENTS =============

function Metric({ label, value, tone }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatNumber(value) : value}</strong>
    </div>
  );
}

function PanelTitle({ title, subtitle }) {
  return (
    <div className="panel-header compact">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function AlertBlock({ tone, title, body }) {
  return (
    <div className={`alert-block ${tone}`}>
      <strong>{title}</strong>
      <p>{body}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className="mini-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
