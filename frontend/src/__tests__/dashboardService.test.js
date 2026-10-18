import {
  transformRafDelta,
  transformSuspectsFunnel,
  transformDeadlineRadar,
  transformProviderHeatmap,
  __private,
} from "../services/dashboardTransforms";

describe("dashboardService transforms", () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2025-08-03T12:00:00-07:00"));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("computes delta, trends, and summary for RAF data", () => {
    const result = transformRafDelta({
      target: 1.85,
      cutoff_date: "2026-01-31",
      series: [
        { date: "2025-08-01", realized: 0.92, daily_add: 0.006 },
        { date: "2025-08-02", realized: 0.926, daily_add: 0.006 },
        { date: "2025-08-03", realized: 0.932, daily_add: 0.006 },
      ],
      forecast: [
        { date: "2026-01-31", realized_p50: 1.81, lo80: 1.72, hi80: 1.89 },
      ],
      breakdown: [
        { group: "All", realized: 1.12 },
        { group: "Group A", realized: 1.02 },
      ],
    });

    expect(result.deltaToday).toBeCloseTo(0.918, 3);
    expect(result.trend.trailing7).toBeCloseTo(0.006, 6);
    expect(result.summary).toContain("RAF realized is 0.93");
    expect(result.targetTrajectory.length).toBeGreaterThan(0);
    expect(result.partial).toBe(false);
  });

  it("marks RAF as partial when series is stale", () => {
    const result = transformRafDelta({
      target: 1.85,
      cutoff_date: "2026-01-31",
      series: [{ date: "2025-07-20", realized: 0.8, daily_add: 0.005 }],
    });
    expect(result.partial).toBe(true);
  });

  it("computes stage conversions and partial flag for suspects funnel", () => {
    const result = transformSuspectsFunnel(
      {
        stages: [
          { key: "suspected", count: 100, median_days: 3 },
          { key: "accepted", count: 70, median_days: 2 },
        ],
        contributors: [{ stage: "accepted", name: "Clinic North", count: 4200 }],
        as_of: "2025-08-02T18:00:00-07:00",
      },
      { from: "2025-08-01", to: "2025-08-03" }
    );
    expect(result.stages[0].conversion).toBeCloseTo(0.7);
    expect(result.partial).toBe(true);
  });

  it("identifies urgent deadline buckets", () => {
    const result = transformDeadlineRadar(
      {
        buckets: [
          { range: "0-3", count: 980 },
          { range: "8-14", count: 3900 },
        ],
      },
      "2026-01-31"
    );
    expect(result.buckets[0].urgent).toBe(true);
    expect(result.buckets[1].urgent).toBe(false);
  });

  it("normalizes provider metric grid to z-scores", () => {
    const result = transformProviderHeatmap(
      {
        providers: ["Dr A", "Dr B"],
        metrics: ["open_raf"],
        values: [
          { provider: "Dr A", metric: "open_raf", value: 120 },
          { provider: "Dr B", metric: "open_raf", value: 140 },
        ],
      },
      { normalize: true }
    );

    expect(result.matrix[0][0].displayValue).toBeCloseTo(-1);
    expect(result.matrix[1][0].displayValue).toBeCloseTo(1);
  });
});

describe("__private helpers", () => {
  it("computes rolling daily add", () => {
    const value = __private.computeRollingDailyAdd(
      [
        { dailyAdd: 1 },
        { dailyAdd: 3 },
        { dailyAdd: 5 },
      ],
      3
    );
    expect(value).toBeCloseTo(3);
  });

  it("builds target trajectory proportional to cutoff", () => {
    const trajectory = __private.buildTargetTrajectory(
      [
        { date: "2025-01-01", realized: 0.5 },
        { date: "2025-06-01", realized: 0.9 },
      ],
      2,
      new Date("2026-01-01")
    );
    expect(trajectory).toHaveLength(2);
    expect(trajectory[1].target).toBeGreaterThan(trajectory[0].target);
  });
});
