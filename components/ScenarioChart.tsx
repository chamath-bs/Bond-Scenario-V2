import React, { useRef, useState, useEffect, useMemo } from 'react';
import { CurvePoint } from '../types';
import { COLORS } from '../constants';
import { interpolateRate } from '../services/bondMath';

interface ScenarioChartProps {
  curveT0: CurvePoint[];
  curveT1: CurvePoint[];
  spreadT0: CurvePoint[];
  horizonYears: number;
  onCurveT1Update: (tenor: number, newRate: number) => void;
}

const ScenarioChart: React.FC<ScenarioChartProps> = ({ 
  curveT0, 
  curveT1, 
  spreadT0,
  horizonYears,
  onCurveT1Update
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [draggingTenor, setDraggingTenor] = useState<number | null>(null);
  const [hoverTenor, setHoverTenor] = useState<number | null>(null);
  const [showOutright, setShowOutright] = useState(false);

  // Chart Configuration
  const margin = { top: 30, right: 30, bottom: 30, left: 40 };
  const maxTenor = 30;
  const minRate = 0; 
  // Dynamic Max Rate: Increase scale to accommodate spreads if showing outright yields
  const maxRate = showOutright ? 12 : 8; 
  
  // Helper: Combine curves for display if showing Outright
  const getEffectiveCurve = (benchmark: CurvePoint[]) => {
    if (!showOutright) return benchmark;
    return benchmark.map(b => {
      const s = spreadT0.find(p => p.tenor === b.tenor);
      return {
        tenor: b.tenor,
        rate: b.rate + (s ? s.rate / 100 : 0)
      };
    });
  };

  const effectiveCurveT0 = useMemo(() => getEffectiveCurve(curveT0), [curveT0, spreadT0, showOutright]);
  const effectiveCurveT1 = useMemo(() => getEffectiveCurve(curveT1), [curveT1, spreadT0, showOutright]);

  // Coordinate Mapping
  const getX = (tenor: number, width: number) => {
    return margin.left + (tenor / maxTenor) * (width - margin.left - margin.right);
  };

  const getY = (rate: number, height: number) => {
    const plotHeight = height - margin.top - margin.bottom;
    const normalizedRate = Math.min(Math.max(rate, minRate), maxRate) / (maxRate - minRate);
    return margin.top + plotHeight - (normalizedRate * plotHeight);
  };

  const getRateFromY = (y: number, height: number) => {
    const plotHeight = height - margin.top - margin.bottom;
    const plotY = y - margin.top;
    const normalized = (plotHeight - plotY) / plotHeight;
    return normalized * (maxRate - minRate) + minRate;
  };

  // Generate Path Data for smoothed curves
  const generatePath = (curve: CurvePoint[], width: number, height: number) => {
    const steps = 100;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxTenor;
      const r = interpolateRate(curve, t);
      const x = getX(t, width);
      const y = getY(r, height);
      d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    }
    return d;
  };

  // Generate Area Path for Spread (Between Benchmark T1 and Total T1)
  const generateSpreadAreaPath = (benchmarkCurve: CurvePoint[], totalCurve: CurvePoint[], width: number, height: number) => {
    const steps = 100;
    let d = "";
    
    // Forward along Total Curve (Top)
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxTenor;
      const r = interpolateRate(totalCurve, t);
      const x = getX(t, width);
      const y = getY(r, height);
      d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    }

    // Backward along Benchmark Curve (Bottom)
    for (let i = steps; i >= 0; i--) {
      const t = (i / steps) * maxTenor;
      const r = interpolateRate(benchmarkCurve, t);
      const x = getX(t, width);
      const y = getY(r, height);
      d += ` L ${x},${y}`;
    }
    
    d += " Z";
    return d;
  };

  // Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent, tenor: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDraggingTenor(tenor);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (draggingTenor !== null && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const rawRate = getRateFromY(y, rect.height);
        
        // Calculate the underlying benchmark rate
        let newBenchmarkRate = rawRate;
        if (showOutright) {
           const spreadPoint = spreadT0.find(s => s.tenor === draggingTenor);
           const spreadVal = spreadPoint ? spreadPoint.rate / 100 : 0;
           newBenchmarkRate = rawRate - spreadVal;
        }

        // Clamp rate (allow negative benchmark if extreme spread, but usually bounded)
        // Bounded at -2% to 15% for sanity
        const clampedRate = Math.max(-2, Math.min(15, newBenchmarkRate)); 
        onCurveT1Update(draggingTenor, clampedRate);
      }
    };

    const handleMouseUp = () => {
      setDraggingTenor(null);
    };

    if (draggingTenor !== null) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingTenor, onCurveT1Update, showOutright, spreadT0]);

  // Responsive sizing
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current;
      setDimensions({ width: clientWidth, height: clientHeight });
    }
    
    const handleResize = () => {
       if (containerRef.current) {
        setDimensions({ 
          width: containerRef.current.clientWidth, 
          height: containerRef.current.clientHeight 
        });
       }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (dimensions.width === 0) return <div ref={containerRef} className="w-full h-full" />;

  const pathT0 = generatePath(effectiveCurveT0, dimensions.width, dimensions.height);
  const pathT1 = generatePath(effectiveCurveT1, dimensions.width, dimensions.height);
  const areaSpread = showOutright ? generateSpreadAreaPath(curveT1, effectiveCurveT1, dimensions.width, dimensions.height) : "";

  return (
    <div ref={containerRef} className="w-full h-full relative select-none cursor-default group">
      
      {/* Toggle Checkbox */}
      <div className="absolute top-0 right-0 z-20 flex items-center gap-2 bg-white/90 px-2 py-1 rounded-bl-lg border-l border-b border-betashares-lightgrey/50">
        <input 
          type="checkbox" 
          id="toggleOutright"
          checked={showOutright}
          onChange={(e) => setShowOutright(e.target.checked)}
          className="w-3.5 h-3.5 accent-betashares-orange cursor-pointer"
        />
        <label htmlFor="toggleOutright" className="text-[10px] font-bold text-betashares-black cursor-pointer uppercase select-none">
          Show Outright Yield
        </label>
      </div>

      {/* Instructions Overlay */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-betashares-lightgrey opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <span className="text-xs font-semibold text-betashares-orange">
          Drag dots to adjust {showOutright ? 'total yield' : 'benchmark curve'}
        </span>
      </div>

      <svg width={dimensions.width} height={dimensions.height} className="overflow-visible">
        
        {/* Y Axis Grid */}
        {Array.from({ length: Math.floor(maxRate / 2) + 1 }, (_, i) => i * 2).map(tick => {
          const y = getY(tick, dimensions.height);
          return (
            <g key={`y-${tick}`}>
              <line 
                x1={margin.left} y1={y} 
                x2={dimensions.width - margin.right} y2={y} 
                stroke="#E5E5E5" strokeDasharray="3 3" 
              />
              <text 
                x={margin.left - 8} y={y + 4} 
                textAnchor="end" 
                className="text-[10px] fill-gray-500 font-sans"
              >
                {tick}%
              </text>
            </g>
          );
        })}

        {/* X Axis Grid */}
        {[0, 5, 10, 15, 20, 25, 30].map(tick => {
          const x = getX(tick, dimensions.width);
          const yBottom = dimensions.height - margin.bottom;
          return (
            <g key={`x-${tick}`}>
               <line 
                x1={x} y1={margin.top} 
                x2={x} y2={yBottom} 
                stroke="#E5E5E5" strokeDasharray="3 3" 
              />
              <text 
                x={x} y={yBottom + 16} 
                textAnchor="middle" 
                className="text-[10px] fill-gray-500 font-sans"
              >
                {tick}y
              </text>
            </g>
          );
        })}

        {/* Labels */}
        <text 
          transform={`rotate(-90)`} 
          x={-dimensions.height / 2} 
          y={12} 
          textAnchor="middle" 
          className="text-xs fill-gray-500 font-bold"
        >
          {showOutright ? 'Total Yield (%)' : 'Benchmark Yield (%)'}
        </text>
        <text 
          x={dimensions.width / 2} 
          y={dimensions.height - 5} 
          textAnchor="middle" 
          className="text-xs fill-gray-500 font-bold"
        >
          Maturity (Years)
        </text>

        {/* Spread Area (Only if Outright Mode) */}
        {showOutright && (
          <path 
            d={areaSpread} 
            fill={COLORS.chart.area} 
            opacity={0.4} 
            stroke="none" 
          />
        )}

        {/* Curves */}
        <path d={pathT0} stroke={COLORS.black} strokeWidth={2} fill="none" strokeDasharray="5 5" opacity={0.5} />
        <path d={pathT1} stroke={COLORS.primary} strokeWidth={3} fill="none" className="drop-shadow-sm" />

        {/* Interactive Dots for T1 (Effective) */}
        {effectiveCurveT1.map((p) => {
          const x = getX(p.tenor, dimensions.width);
          const y = getY(p.rate, dimensions.height);
          const isHovered = hoverTenor === p.tenor;
          const isDragging = draggingTenor === p.tenor;

          return (
            <g 
              key={p.tenor} 
              onMouseDown={(e) => handleMouseDown(e, p.tenor)}
              onMouseEnter={() => setHoverTenor(p.tenor)}
              onMouseLeave={() => setHoverTenor(null)}
              className="cursor-ns-resize"
            >
              {/* Invisible larger hit area */}
              <circle cx={x} cy={y} r={15} fill="transparent" />
              
              {/* Visible Dot */}
              <circle 
                cx={x} cy={y} 
                r={isHovered || isDragging ? 8 : 5} 
                fill={COLORS.primary} 
                stroke="white" 
                strokeWidth={2}
                className="transition-all duration-150"
              />
              
              {/* Tooltip on Hover/Drag */}
              {(isHovered || isDragging) && (
                <g pointerEvents="none">
                  <rect 
                    x={x - 35} y={y - 50} 
                    width={70} height={40} 
                    rx={4} 
                    fill={COLORS.black} 
                    opacity={0.9}
                  />
                  <text x={x} y={y - 32} textAnchor="middle" fill="white" className="text-[10px] font-bold uppercase opacity-80">
                    {p.tenor} Yr {showOutright ? 'Total' : 'Bench'}
                  </text>
                  <text x={x} y={y - 18} textAnchor="middle" fill={COLORS.primary} className="text-[12px] font-bold">
                    {p.rate.toFixed(2)}%
                  </text>
                  {/* Triangle pointer */}
                  <path d={`M ${x-5} ${y-10} L ${x+5} ${y-10} L ${x} ${y-5} Z`} fill={COLORS.black} opacity={0.9} />
                </g>
              )}
            </g>
          );
        })}

      </svg>
    </div>
  );
};

export default ScenarioChart;