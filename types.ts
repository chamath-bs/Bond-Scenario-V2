
export enum CouponFrequency {
  Annual = 1,
  SemiAnnual = 2,
  Quarterly = 4
}

export interface CurvePoint {
  tenor: number; // Years
  rate: number;  // Percentage (e.g., 5.0 for 5%)
}

export interface BondParameters {
  couponRate: number; // Percentage
  maturityYears: number;
  frequency: CouponFrequency;
  faceValue: number;
}

export interface ScenarioParameters {
  horizonYears: number;
  reinvestmentRate?: number; // Optional, defaults to curve implied
}

export interface BondResult {
  cleanPrice: number;
  dirtyPrice: number;
  accruedInterest: number;
  yieldToMaturity: number;
  duration: number;
  convexity: number;
}

export interface TotalReturnResult {
  startPriceDirty: number;
  endPriceDirty: number;
  couponIncome: number;
  reinvestmentIncome: number;
  totalReturnAbs: number;
  totalReturnAnnualized: number;
  
  // High Level Components
  priceReturnComponent: number;
  couponReturnComponent: number;
  reinvestmentReturnComponent: number;

  // Price Return Decomposition
  pullToParReturnComponent: number; // Accretion/Amortization at constant YTM
  rolldownReturnComponent: number; // Marginal gain from sliding down the curve
  durationReturnComponent: number; // Due to parallel shift
  convexityShapeReturnComponent: number; // Due to curve reshaping
}

export type CurveShiftType = 'parallel' | 'steepener' | 'flattener' | 'custom';