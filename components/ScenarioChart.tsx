
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
  const [curveView, setCurveView] = useState<'spot' | 'forward'>('spot');
  
  // Crosshair State for continuous inspection
  const [crosshair, setCrosshair] = useState<{ x: number; y: number; tenor: number; rate: number } | null>(null);

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

  // Helper: Calculate 3m Forward Rate
  const getForwardRate = (curve: CurvePoint[], t: number) => {
    const dt = 0.25; // 3 months
    const rT = interpolateRate(curve, t) / 100;
    const rTdt = interpolateRate(curve, t + dt) / 100;

    // Formula derived from Discrete Annual Compounding DF = (1+r)^-t
    // (1+f)^dt = (1+rTdt)^(t+dt) / (1+rT)^t
    
    const num = Math.pow(1 + rTdt, t + dt);
    const den = Math.pow(1 + rT, t);
    
    // Safety for t=0
    if (den === 0) return 0;

    const fwd = Math.pow(num / den, 1 / dt) - 1;
    return fwd * 100;
  };

  const getDisplayRate = (curve: CurvePoint[], t: number) => {
    if (curveView === 'forward') {
      return getForwardRate(curve, t);
    }
    return interpolateRate(curve, t);
  };

  // Generate Path Data for smoothed curves
  const generatePath = (curve: CurvePoint[], width: number, height: number) => {
    const steps = 100;
    let d = "";
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * maxTenor;
      const r = getDisplayRate(curve, t);
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
      const r = getDisplayRate(totalCurve, t);
      const x = getX(t, width);
      const y = getY(r, height);
      d += i === 0 ? `M ${x},${y}` : ` L ${x},${y}`;
    }

    // Backward along Benchmark Curve (Bottom)
    for (let i = steps; i >= 0; i--) {
      const t = (i / steps) * maxTenor;
      const r = getDisplayRate(benchmarkCurve, t);
      const x = getX(t, width);
      const y = getY(r, height);
      d += ` L ${x},${y}`;
    }
    
    d += " Z";
    return d;
  };

  // Interaction Handlers
  const handleMouseDown = (e: React.MouseEvent, tenor: number) => {
    if (curveView === 'forward') return; // Disable dragging in forward view
    e.preventDefault();
    e.stopPropagation();
    setDraggingTenor(tenor);
    setCrosshair(null); // Hide crosshair when dragging starts
  };

  // Continuous Hover Handler
  const handleChartMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    // If dragging a specific point, don't show the general crosshair
    if (draggingTenor !== null) {
      setCrosshair(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    
    // Check if mouse is within plot area margins (roughly)
    if (rawX < margin.left || rawX > dimensions.width - margin.right) {
      setCrosshair(null);
      return;
    }

    // Map X coordinate to Tenor
    const plotWidth = dimensions.width - margin.left - margin.right;
    let t = ((rawX - margin.left) / plotWidth) * maxTenor;
    t = Math.max(0, Math.min(maxTenor, t));

    // Calculate Rate for the active curve (Effective T1)
    // We use effectiveCurveT1 because that's the main scenario curve the user is interested in
    const r = getDisplayRate(effectiveCurveT1, t);
    
    const xPos = getX(t, dimensions.width);
    const yPos = getY(r, dimensions.height);

    setCrosshair({
      x: xPos,
      y: yPos,
      tenor: t,
      rate: r
    });
  };

  const handleChartMouseLeave = () => {
    setCrosshair(null);
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

        // Clamp rate
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
      
      {/* Controls Overlay (Top Right) */}
      <div className="absolute top-0 right-0 z-20 flex flex-col items-end gap-2">
        
        {/* Spot / Forward Toggle */}
        <div className="flex bg-white/90 rounded-bl-lg border-l border-b border-betashares-lightgrey/50 overflow-hidden">
          <button
            onClick={() => setCurveView('spot')}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
              curveView === 'spot' 
                ? 'bg-betashares-black text-white' 
                : 'text-betashares-grey hover:bg-betashares-offwhite'
            }`}
          >
            Spot Curve
          </button>
          <div className="w-px bg-gray-200"></div>
          <button
            onClick={() => setCurveView('forward')}
            className={`px-3 py-1.5 text-[10px] font-bold uppercase transition-colors ${
              curveView === 'forward' 
                ? 'bg-betashares-black text-white' 
                : 'text-betashares-grey hover:bg-betashares-offwhite'
            }`}
          >
            3m Fwd Curve
          </button>
        </div>

        {/* Outright Toggle */}
        <div className="flex items-center gap-2 bg-white/90 px-2 py-1 rounded-l-lg border-l border-b border-t border-betashares-lightgrey/50 shadow-sm">
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
      </div>

      {/* Instructions Overlay */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm px-3 py-1 rounded-full border border-betashares-lightgrey opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
        <span className="text-xs font-semibold text-betashares-orange">
          {curveView === 'spot' 
            ? `Drag dots to adjust ${showOutright ? 'total yield' : 'benchmark curve'}`
            : 'Switch to Spot Curve view to edit'
          }
        </span>
      </div>

      <svg 
        width={dimensions.width} 
        height={dimensions.height} 
        className="overflow-visible"
        onMouseMove={handleChartMouseMove}
        onMouseLeave={handleChartMouseLeave}
      >
        
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
          {showOutright 
            ? (curveView === 'forward' ? 'Total Implied 3m Fwd (%)' : 'Total Yield (%)') 
            : (curveView === 'forward' ? 'Benchmark Implied 3m Fwd (%)' : 'Benchmark Yield (%)')
          }
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
            pointerEvents="none"
          />
        )}

        {/* Curves */}
        <path d={pathT0} stroke={COLORS.black} strokeWidth={2} fill="none" strokeDasharray="5 5" opacity={0.5} pointerEvents="none" />
        <path d={pathT1} stroke={COLORS.primary} strokeWidth={3} fill="none" className="drop-shadow-sm" pointerEvents="none" />

        {/* Crosshair Tooltip (Only if not hovering over a drag dot) */}
        {crosshair && !hoverTenor && (
          <g pointerEvents="none">
            {/* Vertical Line */}
            <line 
              x1={crosshair.x} y1={margin.top} 
              x2={crosshair.x} y2={dimensions.height - margin.bottom} 
              stroke={COLORS.grey} 
              strokeWidth={1} 
              strokeDasharray="4 4" 
              opacity={0.5} 
            />
            {/* Circle on Curve */}
            <circle 
              cx={crosshair.x} 
              cy={crosshair.y} 
              r={4} 
              fill={COLORS.offWhite} 
              stroke={COLORS.primary} 
              strokeWidth={2} 
            />
            {/* Tooltip Box */}
            <g transform={`translate(${crosshair.x < dimensions.width / 2 ? crosshair.x + 10 : crosshair.x - 130}, ${Math.min(Math.max(crosshair.y - 40, margin.top), dimensions.height - margin.bottom - 40)})`}>
               <rect width={120} height={40} rx={4} fill="rgba(32, 32, 33, 0.9)" />
               <text x={60} y={15} textAnchor="middle" fill="white" className="text-[10px] font-bold uppercase opacity-80">
                 {crosshair.tenor.toFixed(2)} Yr {curveView === 'forward' ? 'Fwd' : 'Yld'}
               </text>
               <text x={60} y={30} textAnchor="middle" fill={COLORS.primary} className="text-[12px] font-bold">
                 {crosshair.rate.toFixed(3)}%
               </text>
            </g>
          </g>
        )}

        {/* Interactive Dots for T1 (Effective) - ONLY SHOW IN SPOT VIEW */}
        {curveView === 'spot' && effectiveCurveT1.map((p) => {
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
