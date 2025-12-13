/**
 * Flood History Modal
 * Shows detailed flood history for a specific road when clicked from map
 */

import { useEffect, useState } from 'react';
import { getRoadFloodHistory, getDaysAgoText, type FloodHotspot } from '@/services/floodHistoryService';
import './FloodHistoryModal.css';

interface FloodHistoryModalProps {
  isOpen: boolean;
  hotspot: FloodHotspot | null;
  onClose: () => void;
}

interface FloodHistoryData {
  hotspot?: FloodHotspot;
  events?: Array<{
    event_id: number;
    event_type: string;
    event_time: string;
    flood_level: string;
    rainfall_mm: number;
  }>;
}

export function FloodHistoryModal({ isOpen, hotspot, onClose }: FloodHistoryModalProps) {
  const [history, setHistory] = useState<FloodHistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'events'>('overview');

  useEffect(() => {
    if (isOpen && hotspot) {
      setLoading(true);
      getRoadFloodHistory(hotspot.road_id)
        .then(data => {
          setHistory(data);
          setLoading(false);
        })
        .catch(error => {
          console.error('Error fetching history:', error);
          setLoading(false);
        });
    }
  }, [isOpen, hotspot]);

  if (!isOpen || !hotspot) return null;

  const getRiskColor = (score: number) => {
    if (score >= 80) return '#8B0000';
    if (score >= 60) return '#FF4500';
    if (score >= 40) return '#FFA500';
    return '#228B22';
  };

  const getRiskBgColor = (score: number) => {
    if (score >= 80) return '#FFB6C6';
    if (score >= 60) return '#FFE4B5';
    if (score >= 40) return '#FFFFE0';
    return '#E0FFE0';
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content flood-history-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>💧 {hotspot.road_name}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-tabs">
          <button
            className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`tab-button ${activeTab === 'events' ? 'active' : ''}`}
            onClick={() => setActiveTab('events')}
          >
            Events ({history?.events?.length || 0})
          </button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-spinner">Loading flood history...</div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="overview-content">
                  {/* Risk Score Card */}
                  <div
                    className="risk-card"
                    style={{
                      backgroundColor: getRiskBgColor(hotspot.risk_score),
                      borderLeftColor: getRiskColor(hotspot.risk_score)
                    }}
                  >
                    <div className="risk-score-large">{hotspot.risk_score.toFixed(1)}</div>
                    <div className="risk-level-text">
                      {hotspot.risk_score >= 80
                        ? 'Critical Risk'
                        : hotspot.risk_score >= 60
                        ? 'High Risk'
                        : hotspot.risk_score >= 40
                        ? 'Medium Risk'
                        : 'Low Risk'}
                    </div>
                    <div className="risk-description">
                      {hotspot.risk_score >= 80
                        ? 'This road floods very frequently and for extended periods'
                        : hotspot.risk_score >= 60
                        ? 'This road is highly prone to flooding'
                        : hotspot.risk_score >= 40
                        ? 'This road occasionally floods'
                        : 'Low flood risk but has flooded before'}
                    </div>
                  </div>

                  {/* Statistics Grid */}
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-icon">📊</div>
                      <div className="stat-label">Total Floods</div>
                      <div className="stat-value">{hotspot.flood_history.total_events}</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">⏱️</div>
                      <div className="stat-label">Total Hours</div>
                      <div className="stat-value">{hotspot.flood_history.total_flooded_hours.toFixed(1)}h</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">📈</div>
                      <div className="stat-label">Avg Duration</div>
                      <div className="stat-value">{hotspot.flood_history.average_duration_hours.toFixed(1)}h</div>
                    </div>

                    <div className="stat-card">
                      <div className="stat-icon">📅</div>
                      <div className="stat-label">Per Year</div>
                      <div className="stat-value">{hotspot.flood_history.frequency_per_year.toFixed(1)}x</div>
                    </div>
                  </div>

                  {/* Last Flood Info */}
                  <div className="info-section">
                    <h3>Last Flood Event</h3>
                    {hotspot.last_flood.start ? (
                      <div className="info-content">
                        <div className="info-row">
                          <span className="label">Started:</span>
                          <span className="value">{getDaysAgoText(hotspot.last_flood.days_since)}</span>
                        </div>
                        {hotspot.last_flood.end && (
                          <div className="info-row">
                            <span className="label">Ended:</span>
                            <span className="value">
                              {new Date(hotspot.last_flood.end).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="info-content">No recent floods recorded</div>
                    )}
                  </div>

                  {/* History Start */}
                  <div className="info-section">
                    <h3>History Start</h3>
                    <div className="info-content">
                      {hotspot.first_recorded
                        ? new Date(hotspot.first_recorded).toLocaleDateString()
                        : 'Unknown'}
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="recommendation-box">
                    <strong>⚠️ Recommendation:</strong>
                    {hotspot.risk_score >= 60
                      ? ' Avoid this area during heavy rainfall. Use alternate routes when possible.'
                      : ' Be cautious in this area during rainy seasons.'}
                  </div>
                </div>
              )}

              {activeTab === 'events' && (
                <div className="events-content">
                  {history?.events && history.events.length > 0 ? (
                    <div className="events-list">
                      {history.events.map((event, idx) => (
                        <div key={event.event_id} className="event-item">
                          <div className="event-icon">
                            {event.event_type === 'flood_start' ? '🌊' : '✓'}
                          </div>
                          <div className="event-details">
                            <div className="event-type">
                              {event.event_type === 'flood_start' ? 'Flooding Started' : 'Flooding Ended'}
                            </div>
                            <div className="event-time">
                              {new Date(event.event_time).toLocaleString()}
                            </div>
                            {event.flood_level && (
                              <div className="event-level" data-level={event.flood_level}>
                                Level: {event.flood_level.toUpperCase()}
                              </div>
                            )}
                            {event.rainfall_mm !== undefined && (
                              <div className="event-rainfall">
                                🌧️ {event.rainfall_mm.toFixed(1)}mm
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state">No flood events recorded yet</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default FloodHistoryModal;
