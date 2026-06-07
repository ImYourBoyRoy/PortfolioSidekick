// ./frontend/src/app/chart/CoachSVGChart.jsx
/**
 * Interactive SVG price chart with crosshair hover for the Coach tab.
 * Created by: Roy Dawson IV
 */
import { useRef, useState, useCallback } from 'react';
import { useSidekick } from '../context/SidekickContext';
import { formatCurrency } from '../utils/formatters';

export default function CoachSVGChart() {
  const s = useSidekick();
  const svgRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e) => {
    if (!svgRef.current || !s.chartData || s.chartData.length === 0) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const width = 800;
    const padding = 40;

    const index = Math.round(((x - padding) / (width - padding * 2)) * (s.chartData.length - 1));

    if (index >= 0 && index < s.chartData.length) {
      setHoverIndex(index);
      setHoveredPoint(s.chartData[index]);
      setMousePos({ x: x + 15, y: y - 10 });
    }
  }, [s.chartData]);

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(-1);
    setHoveredPoint(null);
  }, []);

  if (!s.chartData || s.chartData.length === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-[var(--text-muted)] text-sm font-medium">
        No historical price data loaded.
      </div>
    );
  }

  const width = 800;
  const height = 300;
  const padding = 40;

  if (!s.memoizedChartPaths) {
    return (
      <div className="h-[280px] flex items-center justify-center text-[var(--text-muted)] text-sm font-medium">
        No historical price data loaded.
      </div>
    );
  }

  const { minP, maxP, getX, getY, mainPath, sma50Path, bbAreaPath, simulatedMarkers } = s.memoizedChartPaths;

  return (
    <div style={{ position: 'relative', cursor: 'crosshair' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%', overflow: 'visible' }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {bbAreaPath && (
          <path d={bbAreaPath} fill="rgba(139, 92, 246, 0.03)" stroke="rgba(139, 92, 246, 0.08)" strokeWidth="0.5" strokeDasharray="3,3" />
        )}

        {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
          const y = padding + ratio * (height - padding * 2);
          const val = maxP - ratio * (maxP - minP);
          return (
            <g key={idx}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="rgba(255,255,255,0.02)" strokeWidth="1" />
              <text x={width - padding + 5} y={y + 4} fill="var(--text-muted)" fontSize="8" fontWeight="600" textAnchor="start">
                {formatCurrency(val)}
              </text>
            </g>
          );
        })}

        {sma50Path && (
          <path d={sma50Path} fill="none" stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1.5" />
        )}

        <path
          d={mainPath}
          fill="none"
          stroke="var(--color-oracle)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ filter: 'drop-shadow(0px 0px 8px rgba(139, 92, 246, 0.2))' }}
        />

        {(() => {
          const h = s.holdings.find((row) => row.ticker.toUpperCase() === s.selectedTicker.toUpperCase());
          if (h) {
            const costY = getY(h.avg_buy_price);
            if (costY >= padding && costY <= height - padding) {
              return (
                <g>
                  <line x1={padding} y1={costY} x2={width - padding} y2={costY} stroke="rgba(16, 185, 129, 0.25)" strokeWidth="1" strokeDasharray="4,4" />
                  <text x={padding + 10} y={costY - 5} fill="var(--color-buy)" fontSize="8" fontWeight="800" letterSpacing="0.05em">
                    YOUR COST BASIS: {formatCurrency(h.avg_buy_price)}
                  </text>
                </g>
              );
            }
          }
          return null;
        })()}

        {s.chartOverlays.signals && simulatedMarkers.map((m, idx) => (
          <g key={idx}>
            <circle cx={m.x} cy={m.y} r="4.5" fill={m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'} style={{ filter: `drop-shadow(0px 0px 5px ${m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'})` }} />
            <circle cx={m.x} cy={m.y} r="7" fill="none" stroke={m.type === 'buy' ? 'var(--color-buy)' : 'var(--color-sell)'} strokeWidth="1" opacity="0.3" />
          </g>
        ))}

        {hoverIndex !== -1 && hoveredPoint && (
          <g>
            <line x1={getX(hoverIndex)} y1={padding} x2={getX(hoverIndex)} y2={height - padding} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
            <line x1={padding} y1={getY(hoveredPoint.close_price)} x2={width - padding} y2={getY(hoveredPoint.close_price)} stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="3,3" />
            <circle cx={getX(hoverIndex)} cy={getY(hoveredPoint.close_price)} r="5.5" fill="var(--color-oracle)" style={{ filter: 'drop-shadow(0px 0px 8px var(--color-oracle))' }} />
            <circle cx={getX(hoverIndex)} cy={getY(hoveredPoint.close_price)} r="9" fill="none" stroke="var(--color-oracle)" strokeWidth="1" opacity="0.4" />
          </g>
        )}
      </svg>

      {hoverIndex !== -1 && hoveredPoint && (
        <div
          className="glass-card"
          style={{
            position: 'absolute',
            zIndex: 10,
            backgroundColor: '#0d1016',
            border: '1px solid rgba(139, 92, 246, 0.25)',
            padding: '12px 16px',
            borderRadius: '12px',
            fontSize: '10px',
            width: '160px',
            pointerEvents: 'none',
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
          }}
        >
          <div style={{ fontWeight: '800', color: '#fff', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '4px', marginBottom: '4px' }}>
            <span>Date:</span>
            <span style={{ color: 'var(--text-secondary)' }}>{hoveredPoint.begins_at.slice(0, 10)}</span>
          </div>
          <div style={{ fontWeight: '700', color: '#fff', display: 'flex', justifyContent: 'space-between' }}>
            <span>Price:</span>
            <span style={{ color: '#a78bfa', fontWeight: '900' }}>{formatCurrency(hoveredPoint.close_price)}</span>
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
            <span>Open:</span>
            <span>{formatCurrency(hoveredPoint.open_price)}</span>
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>High/Low:</span>
            <span>{formatCurrency(hoveredPoint.high_price)} / {formatCurrency(hoveredPoint.low_price)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
