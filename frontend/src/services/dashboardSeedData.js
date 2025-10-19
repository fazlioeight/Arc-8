const DEFAULT_TIMEZONE = "America/Los_Angeles";

// Linear congruential generator for repeatable pseudo-randomness so demo charts stay stable
const createRng = (seed = 1) => {
  let state = seed % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const toIsoDate = (date) => date.toISOString().slice(0, 10);

const providerGroups = [
  "Summit Medical Collective",
  "Latitude Health Partners",
  "Harborview ACO",
  "Nova Primary Care",
  "Cascade Physicians Alliance",
];

const providerPool = [
  "Aurora Chen, MD",
  "David Patel, DO",
  "Elena Ramirez, MD",
  "Fatima Khan, NP",
  "Gavin Brooks, MD",
  "Hiroshi Tanaka, MD",
  "Isabella Rossi, MD",
  "Jamal Edwards, PA",
  "Katerina Novak, MD",
  "Liam O'Brien, MD",
  "Maya Desai, MD",
  "Noah Williams, DO",
  "Omar Haddad, MD",
  "Priya Singh, MD",
  "Quinn Harper, NP",
  "Rafael Costa, MD",
  "Sofia Martins, MD",
  "Tariq Al-Masri, MD",
  "Uma Narayanan, MD",
  "Vivian Brooks, MD",
];

const metricList = ["open_raf", "denial_rate", "days_aging", "qa_fail_rate"];

const shuffle = (input, rng) => {
  const copy = [...input];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildStageContributors = (stage, count, rng) => {
  const sample = shuffle(providerPool, rng).slice(0, 6);
  const contributors = [];
  let remaining = count;
  sample.forEach((name, index) => {
    const share = index === sample.length - 1 ? remaining : Math.round(count * (0.12 + rng() * 0.18));
    remaining = Math.max(0, remaining - share);
    contributors.push({
      stage,
      name,
      count: Math.max(12, share),
    });
  });
  return contributors;
};

export const seedRafDelta = (params = {}) => {
  const { modelYear = new Date().getFullYear(), providerGroup = "All" } = params;
  const rng = createRng(modelYear * 31 + providerGroup.length * 17);
  const horizon = 160;
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - (horizon - 1));

  const target = 2.5 + (rng() - 0.5) * 0.35;
  const cutoffDate = new Date(modelYear + 1, 0, 31, 12, 0, 0);

  let realized = 0.85 + rng() * 0.25;
  const series = [];
  for (let index = 0; index < horizon; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const seasonal = 0.012 + 0.01 * Math.sin(index / 10);
    const momentum = (target - realized) * 0.015;
    const noise = (rng() - 0.5) * 0.01;
    const dailyAdd = Math.max(0, seasonal + momentum + noise);
    realized = Math.max(0, realized + dailyAdd);
    series.push({
      date: toIsoDate(date),
      realized: Number(realized.toFixed(3)),
      daily_add: Number(dailyAdd.toFixed(3)),
    });
  }

  const lastDate = new Date(series[series.length - 1].date);
  const forecast = [];
  let projection = realized;
  for (let step = 1; step <= 45; step += 1) {
    const date = new Date(lastDate);
    date.setDate(lastDate.getDate() + step);
    const drift = (target - projection) * 0.045;
    const volatility = (rng() - 0.5) * 0.025;
    projection = Math.max(0, projection + drift + volatility);
    const deviation = Math.max(0.015, Math.abs(volatility) + 0.01);
    forecast.push({
      date: toIsoDate(date),
      realized_p50: Number(projection.toFixed(3)),
      lo80: Number(Math.max(0, projection - deviation).toFixed(3)),
      hi80: Number((projection + deviation).toFixed(3)),
    });
  }

  const groups = providerGroup === "All" ? providerGroups : [providerGroup, ...providerGroups.filter((group) => group !== providerGroup)];
  const breakdownShares = groups.slice(1).map(() => 0.18 + rng() * 0.2);
  const shareTotal = breakdownShares.reduce((acc, value) => acc + value, 0) || 1;
  const breakdown = [
    {
      group: "All",
      realized: Number(realized.toFixed(3)),
    },
    ...groups.slice(0, 4).map((group, index) => ({
      group,
      realized: Number(((realized * breakdownShares[index % breakdownShares.length]) / shareTotal).toFixed(3)),
    })),
  ];

  return {
    target: Number(target.toFixed(3)),
    cutoff_date: cutoffDate.toISOString(),
    series,
    forecast,
    breakdown,
  };
};

export const seedSuspectsFunnel = () => {
  const rng = createRng(734);
  const base = 5200 + rng() * 800;
  const stages = [
    { key: "suspected", retention: 1, median: 3 },
    { key: "coder_reviewed", retention: 0.78, median: 4 },
    { key: "accepted", retention: 0.69, median: 5 },
    { key: "submitted", retention: 0.64, median: 3 },
    { key: "payer_accepted", retention: 0.6, median: 6 },
    { key: "on_score", retention: 0.55, median: 8 },
  ];

  let running = base;
  const stageRows = stages.map((stage, index) => {
    if (index === 0) {
      running = base;
    } else {
      const efficiency = stage.retention * (0.9 + rng() * 0.1);
      running = Math.max(320, running * efficiency);
    }
    const median = Math.max(1, Math.round(stage.median + (rng() - 0.5) * 2));
    return {
      key: stage.key,
      count: Math.round(running),
      median_days: median,
    };
  });

  const contributors = stageRows.flatMap((row) =>
    buildStageContributors(row.key, row.count, rng)
  );

  const asOf = new Date().toISOString();
  return {
    as_of: asOf,
    stages: stageRows,
    contributors,
  };
};

export const seedDeadlineRadar = (params = {}) => {
  const rng = createRng(987 + (params.cutoff ? params.cutoff.length : 0));
  const base = 720 + rng() * 140;
  const bucketDefs = [
    { range: "0-3", urgent: true },
    { range: "4-7", urgent: true },
    { range: "8-14", urgent: false },
    { range: "15-30", urgent: false },
    { range: "31-45", urgent: false },
    { range: "46+", urgent: false },
  ];

  const buckets = bucketDefs.map((bucket, index) => {
    const decay = Math.exp(-index * 0.35);
    const jitter = 0.82 + rng() * 0.35;
    return {
      range: bucket.range,
      count: Math.round(base * decay * jitter),
      urgent: bucket.urgent,
    };
  });

  return {
    buckets,
  };
};

export const seedProviderHeatmap = (params = {}) => {
  const rng = createRng(555 + (params.metric ? params.metric.length : 0));
  const metrics = metricList;
  const providers = shuffle(providerPool, rng).slice(0, 14);

  const baselines = {
    open_raf: 2.1,
    denial_rate: 0.08,
    days_aging: 18,
    qa_fail_rate: 0.06,
  };

  const variances = {
    open_raf: 0.9,
    denial_rate: 0.04,
    days_aging: 6,
    qa_fail_rate: 0.03,
  };

  const values = [];
  const sparklines = {};

  providers.forEach((provider, index) => {
    metrics.forEach((metric) => {
      const base = baselines[metric] ?? 1;
      const variance = variances[metric] ?? 0.5;
      const trend = Math.sin(index / 3) * 0.5;
      const noise = (rng() - 0.5) * variance;
      const value = base + noise + trend;
      values.push({
        provider,
        metric,
        value: Number(value.toFixed(metric.includes("rate") ? 3 : 2)),
      });
    });

    let sparkValue = 1 + rng() * 0.4;
    const points = Array.from({ length: 24 }, (_, pointIndex) => {
      const drift = Math.sin(pointIndex / 4 + index / 3) * 0.15;
      const jitter = (rng() - 0.5) * 0.12;
      sparkValue = Math.max(0, sparkValue + drift + jitter);
      return Number(sparkValue.toFixed(2));
    });
    sparklines[provider] = points;
  });

  return {
    providers,
    metrics,
    values,
    sparklines,
  };
};

export const seedDeadlineCsv = (radarData, filters, user) => {
  const header = ["member_id", "provider_id", "stage", "days_to_cutoff"];
  const rows = [header.join(",")];
  radarData?.buckets?.forEach((bucket) => {
    rows.push(["aggregate", "aggregate", filters.stage, bucket.range].join(","));
  });
  const watermark = [
    `# exported_by=${user?.email || "demo"}`,
    `time=${new Date().toISOString()}`,
    `filters=${JSON.stringify(filters)}`,
  ].join(" ");
  rows.push(watermark);
  return rows.join("\n");
};
