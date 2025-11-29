
export const COLORS = {
  primary: '#FA4D16', // Betashares Orange
  black: '#202021',
  offWhite: '#F0EDEB',
  grey: '#545454',
  lightGrey: '#D4D4D4',
  chart: {
    t0: '#202021',
    t1: '#FA4D16',
    area: '#F9CCAB'
  }
};

export const DEFAULT_CURVE_POINTS = [
  { tenor: 0, rate: 4.35 }, // Overnight
  { tenor: 2, rate: 4.10 },
  { tenor: 5, rate: 4.25 },
  { tenor: 10, rate: 4.50 },
  { tenor: 20, rate: 4.80 },
  { tenor: 30, rate: 4.95 }
];

export const SPREAD_PRESETS = {
  BMARK: [
    { tenor: 0, rate: 0 },
    { tenor: 2, rate: 0 },
    { tenor: 5, rate: 0 },
    { tenor: 10, rate: 0 },
    { tenor: 20, rate: 0 },
    { tenor: 30, rate: 0 }
  ],
  AA: [
    { tenor: 0, rate: 30 },
    { tenor: 2, rate: 45 },
    { tenor: 5, rate: 60 },
    { tenor: 10, rate: 75 },
    { tenor: 20, rate: 85 },
    { tenor: 30, rate: 90 }
  ],
  A: [
    { tenor: 0, rate: 50 },
    { tenor: 2, rate: 70 },
    { tenor: 5, rate: 90 },
    { tenor: 10, rate: 110 },
    { tenor: 20, rate: 125 },
    { tenor: 30, rate: 130 }
  ],
  BBB: [
    { tenor: 0, rate: 85 },
    { tenor: 2, rate: 110 },
    { tenor: 5, rate: 135 },
    { tenor: 10, rate: 150 },
    { tenor: 20, rate: 165 },
    { tenor: 30, rate: 175 }
  ]
};

export const DEFAULT_SPREAD_POINTS = SPREAD_PRESETS.BBB;

export const TENORS = [0, 2, 5, 10, 20, 30];
