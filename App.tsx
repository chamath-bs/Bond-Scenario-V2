
import React, { useState, useMemo } from 'react';
import { 
  CurvePoint, 
  BondParameters, 
  CouponFrequency, 
  CurveShiftType 
} from './types';
import { 
  DEFAULT_CURVE_POINTS, 
  DEFAULT_SPREAD_POINTS,
  SPREAD_PRESETS,
  COLORS 
} from './constants';
import { calculateBondPrice, calculateTotalReturn } from './services/bondMath';
import ScenarioChart from './components/ScenarioChart';
import { Settings, BarChart3, TrendingUp, Sliders, ArrowRight, Activity } from 'lucide-react';

// UI Helpers
const CardTitle: React.FC<{ children: React.ReactNode, icon?: React.ReactNode }> = ({ children, icon }) => (
  <h2 className="text-base font-bold text-betashares-black mb-4 flex items-center gap-2 uppercase tracking-wide">
    {icon && <span className="text-betashares-orange">{icon}</span>}
    {children}
  </h2>
);

const InputGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex flex-col gap-1.5">
    <label className="text-[11px] font-bold text-betashares-grey uppercase tracking-wider">{label}</label>
    {children}
  </div>
);

const NumberInput: React.FC<{ 
  value: number; 
  onChange: (val: number) => void; 
  step?: number; 
  min?: number;
  max?: number;
  suffix?: string 
}> = ({ value, onChange, step = 0.01, min = 0, max, suffix }) => (
  <div className="relative group">
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      step={step}
      min={min}
      max={max}
      className="w-full bg-betashares-offwhite border border-betashares-lightgrey rounded p-2 text-betashares-black font-semibold text-sm focus:ring-2 focus:ring-betashares-orange focus:border-transparent outline-none transition-all group-hover:border-betashares-orange/50"
    />
    {suffix && <span className="absolute right-3 top-2 text-betashares-grey text-xs font-medium">{suffix}</span>}
  </div>
);

const ReturnBar: React.FC<{ 
    label: string; 
    value: number; 
    colorClass: string; 
    maxVal?: number;
    subtext?: string;
    isSubItem?: boolean;
}> = ({ label, value, colorClass, maxVal = 10, subtext, isSubItem = false }) => {
    // Determine bar width and direction
    const widthPercentage = Math.min(Math.abs(value) * 5, 100);
    
    return (
        <div className={`flex items-center gap-4 ${isSubItem ? 'pl-6 border-l-2 border-betashares-offwhite' : ''}`}>
            <div className={`w-28 text-xs font-bold ${isSubItem ? 'text-betashares-grey font-medium' : 'text-betashares-black'} uppercase text-right truncate`}>{label}</div>
            <div className="flex-1 h-8 bg-betashares-offwhite rounded overflow-hidden relative">
                 <div 
                   className={`h-full ${colorClass} opacity-20`}
                   style={{ width: `${widthPercentage}%` }}
                 ></div>
                 <div className="absolute inset-0 flex items-center px-3 text-sm font-bold text-betashares-black">
                    {value > 0 ? '+' : ''}{value.toFixed(2)}%
                 </div>
            </div>
            <div className="text-[10px] text-betashares-grey w-32 hidden sm:block truncate">{subtext}</div>
        </div>
    );
}

// Helper to merge Benchmark (Percent) and Spread (Bps)
const combineCurves = (benchmark: CurvePoint[], spread: CurvePoint[]): CurvePoint[] => {
  return benchmark.map(bPoint => {
    const sPoint = spread.find(s => s.tenor === bPoint.tenor);
    const spreadVal = sPoint ? sPoint.rate : 0;
    return {
      tenor: bPoint.tenor,
      rate: bPoint.rate + (spreadVal / 100) // Convert bps to %
    };
  });
};

function App() {
  // --- State ---
  
  // Market Data (T0 Curve)
  const [curveT0, setCurveT0] = useState<CurvePoint[]>(DEFAULT_CURVE_POINTS);
  
  // Credit Spreads (T0) - New for V2
  const [spreadT0, setSpreadT0] = useState<CurvePoint[]>(DEFAULT_SPREAD_POINTS);

  // Bond Data
  const [bond, setBond] = useState<BondParameters>({
    couponRate: 5.50, // Updated default for Corp Bond feel
    maturityYears: 10,
    frequency: CouponFrequency.SemiAnnual,
    faceValue: 100
  });

  // Scenario (T1 Curve + Horizon)
  const [curveT1, setCurveT1] = useState<CurvePoint[]>(DEFAULT_CURVE_POINTS);
  const [horizonYears, setHorizonYears] = useState<number>(1);
  
  // Scenario Utils
  const [shiftType, setShiftType] = useState<CurveShiftType>('custom');

  // --- Calculations ---

  // Merge Curves for Pricing (Benchmark + Spread)
  const totalCurveT0 = useMemo(() => combineCurves(curveT0, spreadT0), [curveT0, spreadT0]);
  
  // For T1, we assume Spread remains constant (OAS) for this version, 
  // so we combine the Scenaio Benchmark (T1) with the Original Spread (T0).
  const totalCurveT1 = useMemo(() => combineCurves(curveT1, spreadT0), [curveT1, spreadT0]);

  const t0Price = useMemo(() => calculateBondPrice(bond, totalCurveT0, 0), [bond, totalCurveT0]);
  
  const results = useMemo(() => 
    calculateTotalReturn(bond, totalCurveT0, totalCurveT1, horizonYears), 
    [bond, totalCurveT0, totalCurveT1, horizonYears]
  );

  // --- Handlers ---

  const handleT0Change = (tenor: number, newRate: number) => {
    const newCurve = curveT0.map(p => p.tenor === tenor ? { ...p, rate: newRate } : p);
    setCurveT0(newCurve);
    // Auto-update T1 if it hasn't been modified yet or if we want to sync
    if (shiftType === 'custom') {
       // Optional: decide if T1 should follow T0 changes when in custom mode or not. 
       // For now, let's keep them independent unless reset.
    }
  };

  const handleSpreadChange = (tenor: number, newBps: number) => {
    const newSpread = spreadT0.map(p => p.tenor === tenor ? { ...p, rate: newBps } : p);
    setSpreadT0(newSpread);
  };

  const handleT1Change = (tenor: number, newRate: number) => {
    setShiftType('custom');
    const newCurve = curveT1.map(p => p.tenor === tenor ? { ...p, rate: newRate } : p);
    setCurveT1(newCurve);
  };

  const applyScenario = (type: CurveShiftType, amount: number) => {
    setShiftType(type);
    let newCurve = [...curveT0];

    if (type === 'parallel') {
      newCurve = curveT0.map(p => ({ ...p, rate: p.rate + amount }));
    } else if (type === 'steepener') {
      newCurve = curveT0.map(p => {
        const diff = p.tenor - 5;
        const move = (diff / 10) * amount; 
        return { ...p, rate: p.rate + move };
      });
    } else if (type === 'flattener') {
      newCurve = curveT0.map(p => {
        const diff = p.tenor - 5;
        const move = (diff / 10) * amount * -1;
        return { ...p, rate: p.rate + move };
      });
    } else if (type === 'custom') {
      newCurve = [...curveT0];
    }
    setCurveT1(newCurve);
  };

  // --- Render ---

  return (
    <div className="min-h-screen bg-[#F8F9FA] font-sans text-betashares-black pb-12 selection:bg-betashares-orange selection:text-white">
      
      {/* Header */}
      <header className="bg-white border-b border-betashares-lightgrey sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-betashares-orange rounded flex items-center justify-center text-white font-black text-xl shadow-md shadow-betashares-orange/20">
              B
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight leading-tight">Bond Scenario Analyst <span className="text-betashares-orange text-xs align-top ml-1">V2</span></h1>
              <p className="text-[10px] text-betashares-grey font-medium uppercase tracking-wider">Single Security Modeling</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden md:flex items-center gap-2 bg-betashares-offwhite px-3 py-1.5 rounded-full border border-betashares-lightgrey">
                <div className="w-2 h-2 rounded-full bg-betashares-black"></div>
                <span className="text-xs font-semibold text-betashares-grey">Market (T0)</span>
                <span className="text-xs text-betashares-lightgrey mx-1">|</span>
                <div className="w-2 h-2 rounded-full bg-betashares-orange"></div>
                <span className="text-xs font-semibold text-betashares-orange">Scenario (T1)</span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Left Sidebar: Inputs */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* Bond Card */}
            <div className="bg-white rounded-xl shadow-sm border border-betashares-lightgrey/60 p-5">
              <CardTitle icon={<Settings size={16} />}>Bond Definition</CardTitle>
              <div className="grid grid-cols-2 gap-x-3 gap-y-4">
                <InputGroup label="Coupon (%)">
                  <NumberInput value={bond.couponRate} onChange={v => setBond({...bond, couponRate: v})} />
                </InputGroup>
                <InputGroup label="Maturity">
                  <NumberInput value={bond.maturityYears} onChange={v => setBond({...bond, maturityYears: v})} min={0.5} suffix="Yrs" />
                </InputGroup>
                <InputGroup label="Frequency">
                  <select 
                    className="w-full bg-betashares-offwhite border border-betashares-lightgrey rounded p-2 text-betashares-black font-semibold text-sm focus:ring-2 focus:ring-betashares-orange outline-none cursor-pointer"
                    value={bond.frequency}
                    onChange={(e) => setBond({...bond, frequency: parseInt(e.target.value)})}
                  >
                    <option value={1}>Annual</option>
                    <option value={2}>Semi-Annual</option>
                    <option value={4}>Quarterly</option>
                  </select>
                </InputGroup>
                <InputGroup label="Face Value">
                  <NumberInput value={bond.faceValue} onChange={v => setBond({...bond, faceValue: v})} />
                </InputGroup>
              </div>
              
              <div className="mt-6 pt-4 border-t border-betashares-lightgrey">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold text-betashares-grey">TOTAL YIELD (YTM)</span>
                    <span className="text-sm font-mono font-bold text-betashares-black">{t0Price.yieldToMaturity.toFixed(2)}%</span>
                 </div>
                 <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-betashares-grey">DURATION</span>
                    <span className="text-sm font-mono font-bold text-betashares-black">{t0Price.duration.toFixed(2)} Yrs</span>
                 </div>
              </div>
            </div>

            {/* Benchmark Curve Card */}
            <div className="bg-white rounded-xl shadow-sm border border-betashares-lightgrey/60 p-5">
              <div className="flex justify-between items-center mb-4">
                 <CardTitle icon={<BarChart3 size={16} />}>Benchmark Zero Coupon Curve</CardTitle>
                 <button 
                  onClick={() => { setCurveT0(DEFAULT_CURVE_POINTS); setCurveT1(DEFAULT_CURVE_POINTS); }}
                  className="text-[10px] font-bold text-betashares-orange hover:text-betashares-black transition-colors"
                 >
                   RESET
                 </button>
              </div>
              <div className="space-y-3">
                {curveT0.map((point) => (
                  <div key={point.tenor} className="flex items-center gap-2">
                     <span className="w-8 text-[11px] font-bold text-betashares-grey text-right">{point.tenor}y</span>
                     <input 
                        type="range"
                        min="0" max="8" step="0.05"
                        value={point.rate}
                        onChange={(e) => handleT0Change(point.tenor, parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-betashares-black"
                     />
                     <span className="w-10 text-xs font-mono font-semibold text-right">{point.rate.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Credit Spreads Card (New V2) */}
            <div className="bg-white rounded-xl shadow-sm border border-betashares-lightgrey/60 p-5">
              
              <div className="flex flex-col gap-3 mb-4">
                  <div className="flex justify-between items-center">
                     <CardTitle icon={<Activity size={16} />}>Credit Spreads</CardTitle>
                  </div>
                  {/* Preset Buttons */}
                  <div className="flex items-center gap-1">
                     {Object.entries(SPREAD_PRESETS).map(([label, preset]) => (
                        <button 
                          key={label}
                          onClick={() => setSpreadT0(preset)}
                          className="flex-1 px-2 py-1.5 text-[10px] font-bold bg-betashares-offwhite hover:bg-betashares-orange hover:text-white text-betashares-grey rounded transition-colors uppercase"
                        >
                          {label}
                        </button>
                     ))}
                  </div>
              </div>

              <div className="space-y-3">
                {spreadT0.map((point) => (
                  <div key={point.tenor} className="flex items-center gap-2">
                     <span className="w-8 text-[11px] font-bold text-betashares-grey text-right">{point.tenor}y</span>
                     <input 
                        type="range"
                        min="0" max="500" step="1"
                        value={point.rate}
                        onChange={(e) => handleSpreadChange(point.tenor, parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-betashares-black"
                     />
                     <span className="w-10 text-xs font-mono font-semibold text-right">{point.rate.toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Main Content: Chart & Scenario */}
          <div className="lg:col-span-9 flex flex-col gap-6">
             
             {/* Chart Section */}
             <div className="bg-white rounded-xl shadow-sm border border-betashares-lightgrey/60 p-1 flex-1 min-h-[500px] flex flex-col">
                <div className="p-4 border-b border-betashares-lightgrey/40 flex flex-wrap items-center justify-between gap-4">
                   <div className="flex items-center gap-2">
                      <TrendingUp className="text-betashares-orange" size={20} />
                      <h2 className="text-lg font-bold">Benchmark Curve Simulation</h2>
                   </div>
                   
                   {/* Quick Actions Toolbar */}
                   <div className="flex items-center gap-2">
                      <div className="flex bg-betashares-offwhite rounded-lg p-1 border border-betashares-lightgrey">
                         <button 
                            onClick={() => applyScenario('parallel', 0.5)}
                            className="px-3 py-1.5 text-xs font-semibold rounded hover:bg-white hover:shadow-sm transition-all text-betashares-grey hover:text-betashares-orange"
                         >
                            +50bp
                         </button>
                         <button 
                            onClick={() => applyScenario('parallel', -0.5)}
                            className="px-3 py-1.5 text-xs font-semibold rounded hover:bg-white hover:shadow-sm transition-all text-betashares-grey hover:text-betashares-orange"
                         >
                            -50bp
                         </button>
                         <div className="w-px bg-gray-300 mx-1 my-1"></div>
                         <button 
                            onClick={() => applyScenario('flattener', 1)}
                            className="px-3 py-1.5 text-xs font-semibold rounded hover:bg-white hover:shadow-sm transition-all text-betashares-grey hover:text-betashares-orange"
                         >
                            Flatten
                         </button>
                         <button 
                            onClick={() => applyScenario('steepener', 1)}
                            className="px-3 py-1.5 text-xs font-semibold rounded hover:bg-white hover:shadow-sm transition-all text-betashares-grey hover:text-betashares-orange"
                         >
                            Steepen
                         </button>
                      </div>
                      <button 
                        onClick={() => { setCurveT1([...curveT0]); setShiftType('custom'); }}
                        className="ml-2 px-3 py-1.5 text-xs font-bold text-white bg-betashares-black rounded-lg hover:bg-betashares-orange transition-colors"
                      >
                        Match T0
                      </button>
                   </div>
                </div>
                
                <div className="flex-1 relative w-full h-full p-2">
                   {/* Note: Chart continues to display Benchmark Curve to allow specific yield curve risk modeling */}
                   <ScenarioChart 
                      curveT0={curveT0} 
                      curveT1={curveT1} 
                      spreadT0={spreadT0}
                      horizonYears={horizonYears} 
                      onCurveT1Update={handleT1Change}
                   />
                </div>

                <div className="p-4 bg-betashares-offwhite/50 border-t border-betashares-lightgrey/40 flex items-center justify-between">
                   <div className="flex items-center gap-4">
                      <Sliders size={16} className="text-betashares-grey" />
                      <div className="flex items-center gap-2">
                         <span className="text-xs font-bold text-betashares-grey uppercase">Horizon:</span>
                         <input 
                           type="range" min="0.1" max={bond.maturityYears - 0.1} step="0.1"
                           value={horizonYears}
                           onChange={(e) => setHorizonYears(parseFloat(e.target.value))}
                           className="w-32 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer accent-betashares-orange"
                         />
                         <span className="text-sm font-mono font-bold w-12">{horizonYears.toFixed(1)}y</span>
                      </div>
                   </div>
                   <div className="text-xs text-betashares-grey italic">
                      Drag points on chart to customize benchmark scenario
                   </div>
                </div>
             </div>

             {/* Results Section */}
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Total Return Hero */}
                <div className="bg-betashares-black rounded-xl p-6 text-white shadow-lg flex flex-col justify-between relative overflow-hidden group">
                   <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <ArrowRight size={64} />
                   </div>
                   <div>
                      <h3 className="text-betashares-lightgrey text-xs font-bold uppercase tracking-widest mb-1">Total Return</h3>
                      <p className="text-xs text-gray-400">Over {horizonYears} Year Horizon</p>
                   </div>
                   <div className="mt-4">
                      <div className={`text-4xl font-black tracking-tighter ${results.totalReturnAbs >= 0 ? 'text-white' : 'text-red-400'}`}>
                         {results.totalReturnAbs > 0 ? '+' : ''}{results.totalReturnAbs.toFixed(2)}%
                      </div>
                      <div className="mt-2 text-xs font-mono text-gray-400 border-t border-gray-700 pt-2 inline-block">
                         Annualized: {results.totalReturnAnnualized.toFixed(2)}%
                      </div>
                   </div>
                </div>

                {/* Return Decomposition */}
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm border border-betashares-lightgrey/60 p-6">
                   <CardTitle icon={<BarChart3 size={16} />}>Return Decomposition</CardTitle>
                   
                   <div className="flex flex-col gap-2">
                      {/* Price Return Summary */}
                      <ReturnBar 
                        label="Price Change" 
                        value={results.priceReturnComponent} 
                        colorClass={results.priceReturnComponent >= 0 ? 'bg-betashares-black' : 'bg-red-500'}
                        subtext="Capital Gain/Loss"
                      />
                      
                      {/* Price Decomposition Sub-items */}
                      <div className="pl-4 border-l border-gray-200 ml-4 space-y-2 my-2">
                         <ReturnBar 
                           label="Rolldown" 
                           value={results.rolldownReturnComponent} 
                           colorClass="bg-gray-500"
                           isSubItem
                           subtext="Time + Curve Decay"
                         />
                         <ReturnBar 
                           label="Duration" 
                           value={results.durationReturnComponent} 
                           colorClass={results.durationReturnComponent >= 0 ? 'bg-gray-500' : 'bg-red-500'}
                           isSubItem
                           subtext="Parallel Shift"
                         />
                         <ReturnBar 
                           label="Shape" 
                           value={results.convexityShapeReturnComponent} 
                           colorClass={results.convexityShapeReturnComponent >= 0 ? 'bg-gray-500' : 'bg-red-500'}
                           isSubItem
                           subtext="Twist/Steepening"
                         />
                      </div>

                      {/* Cash Components */}
                      <ReturnBar 
                        label="Coupons" 
                        value={results.couponReturnComponent} 
                        colorClass="bg-betashares-orange"
                        subtext="Cash Coupons"
                      />
                      
                      <ReturnBar 
                        label="Reinvest" 
                        value={results.reinvestmentReturnComponent} 
                        colorClass="bg-blue-500"
                        subtext="Interest on Cash"
                      />
                   </div>
                </div>

             </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
