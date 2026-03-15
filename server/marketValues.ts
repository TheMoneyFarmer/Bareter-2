// UAE Market Average Values (AED) per category
// Based on typical UAE marketplace rates
export const UAE_MARKET_AVERAGES: Record<string, number> = {
  "Hospitality": 8000,
  "Fashion": 3000,
  "Modeling": 5000,
  "SaaS": 12000,
  "Photography": 4500,
  "Services": 3500,
  "Food": 2500,
  "Legal": 15000,
  "Events": 10000,
  "Real Estate": 50000,
  "Automotive": 35000,
  "Health & Wellness": 4000,
  "Education": 3000,
  "Marketing": 8000,
  "Technology": 12000,
  "Consulting": 10000,
  "Design": 5000,
  "Entertainment": 6000,
};

export function getMarketAverage(categories: string[]): number | null {
  if (!categories || categories.length === 0) return null;
  const averages = categories
    .map(c => UAE_MARKET_AVERAGES[c])
    .filter((v): v is number => v !== undefined);
  if (averages.length === 0) return null;
  return Math.round(averages.reduce((a, b) => a + b, 0) / averages.length);
}

export function isValueFlagged(declaredValue: number, categories: string[]): boolean {
  const avg = getMarketAverage(categories);
  if (!avg) return false;
  return declaredValue < avg * 0.7;
}
