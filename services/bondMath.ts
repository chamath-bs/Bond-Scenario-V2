
import { CurvePoint, BondParameters, BondResult, TotalReturnResult, CouponFrequency } from '../types';

/**
 * Monotone Cubic Hermite Interpolation
 * Preserves the shape of the data and avoids the "overshoot" common in standard cubic splines.
 */
class MonotoneCubicSpline {
  xs: number[];
  ys: number[];
  ks: number[];

  constructor(xs: number[], ys: number[]) {
    this.xs = xs;
    this.ys = ys;
    const n = xs.length;
    
    // Calculate secants
    const ms = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      ms[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
    }

    // Calculate tangents
    const ks = new Array(n);
    
    // Standard finite difference for internal points
    for (let i = 1; i < n - 1; i++) {
      ks[i] = (ms[i - 1] + ms[i]) / 2;
    }
    // Endpoints (simple linear projection or one-sided difference)
    ks[0] = ms[0];
    ks[n - 1] = ms[n - 2];

    // Fix tangents to ensure monotonicity
    for (let i = 0; i < n - 1; i++) {
      if (ms[i] === 0) {
        ks[i] = 0;
        ks[i + 1] = 0;
      } else {
        const alpha = ks[i] / ms[i];
        const beta = ks[i + 1] / ms[i];
        if (alpha < 0) ks[i] = 0; // Should not happen in this construction but safe guard
        if (beta < 0) ks[i + 1] = 0;
        
        // Clamp to prevent overshoot
        const h = Math.hypot(alpha, beta);
        if (h > 3) {
           const t = 3 / h;
           ks[i] = alpha * t * ms[i];
           ks[i + 1] = beta * t * ms[i];
        }
      }
    }
    this.ks = ks;
  }

  at(x: number): number {
    const { xs, ys, ks } = this;
    const n = xs.length;

    // Extrapolation: Flat outside range (or linear using endpoint tangent)
    // Finance convention usually: Flat extrapolation for yields
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];

    // Find interval
    // Optimized for small N (N=6), linear search is faster than binary
    let i = 0;
    for (let j = 0; j < n - 1; j++) {
      if (x >= xs[j] && x <= xs[j + 1]) {
        i = j;
        break;
      }
    }

    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis functions
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const y = h00 * ys[i] + h10 * h * ks[i] + h01 * ys[i + 1] + h11 * h * ks[i + 1];
    return y;
  }
}

let cachedSpline: { curve: CurvePoint[], spline: MonotoneCubicSpline } | null = null;

export const interpolateRate = (curve: CurvePoint[], t: number): number => {
  // Simple caching strategy if the curve reference hasn't changed
  if (!cachedSpline || cachedSpline.curve !== curve) {
    // Sort just in case, though usually pre-sorted
    const sorted = [...curve].sort((a, b) => a.tenor - b.tenor);
    cachedSpline = {
      curve,
      spline: new MonotoneCubicSpline(
        sorted.map(p => p.tenor),
        sorted.map(p => p.rate)
      )
    };
  }
  return cachedSpline.spline.at(t);
};

/**
 * Solve for YTM (IRR) using Newton-Raphson
 * Equation: Price = Sum( CF_i / (1 + y/f)^(t_i * f) )
 */
const solveForYTM = (
  cashFlows: { t: number; amount: number }[],
  targetPrice: number,
  frequency: number
): number => {
  let y = 0.05; // Initial guess 5%
  const maxIter = 20;
  const tol = 1e-8;

  for (let i = 0; i < maxIter; i++) {
    let f = 0;
    let df = 0;
    
    // Base discount factor for derivative calc: (1 + y/freq)
    const base = 1 + y / frequency;

    for (const cf of cashFlows) {
      const periods = cf.t * frequency;
      const factor = Math.pow(base, -periods);
      
      f += cf.amount * factor;
      
      // Derivative with respect to y:
      // d/dy [ C * (1 + y/f)^(-periods) ] 
      // = C * (-periods) * (1 + y/f)^(-periods - 1) * (1/f)
      // = C * (-cf.t * f) * (1/f) * ...
      // = -C * cf.t * (1 + y/f)^(-periods - 1)
      df -= cf.amount * cf.t * Math.pow(base, -periods - 1);
    }

    const diff = f - targetPrice;
    if (Math.abs(diff) < tol) return y;
    
    if (df === 0) break;
    y = y - diff / df;
  }

  return y;
};

/**
 * Calculate Bond Price and Risk Metrics
 */
export const calculateBondPrice = (
  bond: BondParameters,
  curve: CurvePoint[],
  settlementShift: number = 0 // Years from T0
): BondResult => {
  const { couponRate, maturityYears, frequency, faceValue } = bond;
  
  // Remaining time to maturity
  const remainingTTM = maturityYears - settlementShift;
  
  if (remainingTTM <= 0) {
    return {
      cleanPrice: faceValue,
      dirtyPrice: faceValue,
      accruedInterest: 0,
      yieldToMaturity: 0,
      duration: 0,
      convexity: 0
    };
  }

  const periodLength = 1 / frequency;
  
  const periodsRemaining = Math.ceil(remainingTTM * frequency);
  const timeToNextCoupon = remainingTTM - (periodsRemaining - 1) * periodLength;
  const timeSinceLastCoupon = periodLength - timeToNextCoupon;
  
  const couponAmount = (couponRate / 100) * faceValue / frequency;
  const accruedInterest = (timeSinceLastCoupon / periodLength) * couponAmount;

  let pvCashFlows = 0;
  let macacaulayDurationSum = 0;
  let convexitySum = 0;

  // Track cash flows for YTM solver
  const cashFlows: { t: number; amount: number }[] = [];

  // Discount Cash Flows using Zero Curve
  for (let i = 0; i < periodsRemaining; i++) {
    const t = timeToNextCoupon + i * periodLength; // Time in years to this cash flow
    const isMaturity = i === periodsRemaining - 1;
    
    const cashFlow = couponAmount + (isMaturity ? faceValue : 0);
    cashFlows.push({ t, amount: cashFlow });
    
    // Get Zero Rate for time t
    // Note: settlementShift is the age of the bond. 
    // The zero rate we need is for term 't'. 
    // If we are pricing at T1 (horizon), the 'curve' passed in should be the T1 curve.
    // The term 't' is time from *now* (T1) to cashflow. 
    
    const r = interpolateRate(curve, t) / 100;
    
    // Discrete Annual Compounding assumption for spot rates
    const df = Math.pow(1 + r, -t);
    
    const pv = cashFlow * df;
    pvCashFlows += pv;
    
    macacaulayDurationSum += t * pv;
    convexitySum += t * (t + 1) * pv; 
  }

  const dirtyPrice = pvCashFlows;
  const cleanPrice = dirtyPrice - accruedInterest;
  const duration = (macacaulayDurationSum / dirtyPrice);

  // Calculate True YTM
  const yieldToMaturityRaw = solveForYTM(cashFlows, dirtyPrice, frequency);
  const yieldToMaturity = yieldToMaturityRaw * 100;

  return {
    cleanPrice,
    dirtyPrice,
    accruedInterest,
    yieldToMaturity,
    duration,
    // Approximate convexity using YTM
    convexity: convexitySum / (dirtyPrice * Math.pow(1 + yieldToMaturityRaw/frequency, 2))
  };
};

/**
 * Calculate Scenario Return with Decomposition
 */
export const calculateTotalReturn = (
  bond: BondParameters,
  curveT0: CurvePoint[],
  curveT1: CurvePoint[],
  horizonYears: number
): TotalReturnResult => {
  
  // 1. Initial State (T0)
  const t0Result = calculateBondPrice(bond, curveT0, 0);
  const startPriceDirty = t0Result.dirtyPrice;

  // 2. Final State (T1 - Actual Scenario)
  const t1Result = calculateBondPrice(bond, curveT1, horizonYears);
  const endPriceDirty = t1Result.dirtyPrice;
  
  // --- Income Component ---
  const { couponRate, frequency, faceValue } = bond;
  const periodLength = 1 / frequency;
  const couponAmount = (couponRate / 100) * faceValue / frequency;
  
  let totalCoupons = 0;
  let reinvestmentIncome = 0;
  
  const periodsTotal = Math.ceil(bond.maturityYears * frequency);
  const firstCouponTime = bond.maturityYears - (periodsTotal - 1) * periodLength; 

  for (let i = 0; i < periodsTotal; i++) {
    const t = firstCouponTime + i * periodLength; // Time of CF from T0
    
    if (t > 0 && t <= horizonYears) {
      totalCoupons += couponAmount;
      
      const timeToReinvest = horizonYears - t;
      if (timeToReinvest > 0) {
        // Reinvest at Scenario Rate (T1)
        // Assumption: Curve shifts immediately or represents the average reinvestment environment for the period
        const r_reinvest = interpolateRate(curveT1, timeToReinvest) / 100;
        const futureValue = couponAmount * Math.pow(1 + r_reinvest, timeToReinvest);
        reinvestmentIncome += (futureValue - couponAmount);
      }
    }
  }

  // --- Price Return Decomposition ---

  // A. Rolldown Price
  // Price at T=Horizon using the ORIGINAL T0 Curve.
  // This isolates the effect of "Time Passing" and "Rolling down the curve".
  const rolldownResult = calculateBondPrice(bond, curveT0, horizonYears);
  const priceRolldownDirty = rolldownResult.dirtyPrice;

  // B. Parallel Shift Price
  // Price at T=Horizon using a Shifted T0 Curve.
  // The shift is defined by the change in the Zero Rate at the bond's remaining maturity.
  const remainingMaturity = bond.maturityYears - horizonYears;
  let priceParallelDirty = priceRolldownDirty; 
  
  if (remainingMaturity > 0) {
    const rateT0 = interpolateRate(curveT0, remainingMaturity);
    const rateT1 = interpolateRate(curveT1, remainingMaturity);
    const shift = rateT1 - rateT0;
    
    // Create Parallel Curve
    const curveParallel = curveT0.map(p => ({ ...p, rate: p.rate + shift }));
    const parallelResult = calculateBondPrice(bond, curveParallel, horizonYears);
    priceParallelDirty = parallelResult.dirtyPrice;
  }

  // C. Components Calculation
  // Total Price Change = (End - Start)
  // Decomposed:
  // 1. Rolldown = (Price_Rolldown - Start)
  // 2. Duration (Parallel) = (Price_Parallel - Price_Rolldown)
  // 3. Shape (Residual) = (Price_End - Price_Parallel)

  const rolldownDiff = priceRolldownDirty - startPriceDirty;
  const durationDiff = priceParallelDirty - priceRolldownDirty;
  const shapeDiff = endPriceDirty - priceParallelDirty;

  // Verify Sum
  // rolldownDiff + durationDiff + shapeDiff 
  // = (P_roll - Start) + (P_para - P_roll) + (P_end - P_para)
  // = - Start + P_end = Total Price Change. Correct.

  // --- Totals ---
  const totalValueT1 = endPriceDirty + totalCoupons + reinvestmentIncome;
  const totalReturnAbs = (totalValueT1 - startPriceDirty) / startPriceDirty;
  
  const priceReturnComponent = (endPriceDirty - startPriceDirty) / startPriceDirty;
  const couponReturnComponent = totalCoupons / startPriceDirty;
  const reinvestmentReturnComponent = reinvestmentIncome / startPriceDirty;

  // Decomposed Percentages
  const rolldownReturnComponent = rolldownDiff / startPriceDirty;
  const durationReturnComponent = durationDiff / startPriceDirty;
  const convexityShapeReturnComponent = shapeDiff / startPriceDirty;

  let totalReturnAnnualized = totalReturnAbs;
  if (horizonYears > 1) {
    totalReturnAnnualized = Math.pow(1 + totalReturnAbs, 1 / horizonYears) - 1;
  }

  return {
    startPriceDirty,
    endPriceDirty,
    couponIncome: totalCoupons,
    reinvestmentIncome,
    totalReturnAbs: totalReturnAbs * 100,
    totalReturnAnnualized: totalReturnAnnualized * 100,
    priceReturnComponent: priceReturnComponent * 100,
    couponReturnComponent: couponReturnComponent * 100,
    reinvestmentReturnComponent: reinvestmentReturnComponent * 100,
    rolldownReturnComponent: rolldownReturnComponent * 100,
    durationReturnComponent: durationReturnComponent * 100,
    convexityShapeReturnComponent: convexityShapeReturnComponent * 100
  };
};
