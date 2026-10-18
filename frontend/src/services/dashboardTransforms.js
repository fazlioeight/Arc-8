const TIMEZONE = "America/Los_Angeles";

export function transformRafDelta(raw = {}) {
  const target = Number(raw.target) || 0;
  const cutoff = raw.cutoff_date ? new Date(raw.cutoff_date) : null;
  const series = Array.isArray(raw.series)
    ? raw.series
        .map((point) => ({
          date: point.date,
          realized: Number(point.realized) || 0,
          dailyAdd: Number(point.daily_add) || 0,
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const todayPoint = series.length ? series[series.length - 1] : null;
  const deltaToday = todayPoint ? target - todayPoint.realized : target;
  const trend7 = computeRollingDailyAdd(series, 7);
  const trend30 = computeRollingDailyAdd(series, 30);
  const targetTrajectory = buildTargetTrajectory(series, target, cutoff);
  const forecast = Array.isArray(raw.forecast)
    ? raw.forecast.map((entry) => ({
        date: entry.date,
        p50: Number(entry.realized_p50) || null,
        lo80: Number(entry.lo80) || null,
        hi80: Number(entry.hi80) || null,
      }))
    : [];

  const breakdown = Array.isArray(raw.breakdown) ? raw.breakdown : [{ group: "All", realized: todayPoint?.realized || 0 }];

  const partial = detectSeriesPartial(series, cutoff);

  return {
    target,
    cutoff,
    series,
    deltaToday,
    trend: {
      trailing7: trend7,
      trailing30: trend30,
    },
    targetTrajectory,
    forecast,
    breakdown,
    partial,
    summary: buildRafSummary(target, todayPoint, forecast, cutoff),
  };
}

export function transformSuspectsFunnel(raw = {}, range = {}) {
  const stages = Array.isArray(raw.stages) ? raw.stages : [];
  const ordered = stages.map((stage, index) => {
    const next = stages[index + 1];
    const conversion = next && stage.count ? next.count / stage.count : 0;
    return {
      key: stage.key,
      label: stageLabel(stage.key),
      count: Number(stage.count) || 0,
      medianDays: Number(stage.median_days) || 0,
      conversion: Number.isFinite(conversion) ? conversion : 0,
    };
  });
  const partial = isPartialRange(raw.as_of, range?.to);
  const contributors = Array.isArray(raw.contributors) ? raw.contributors : [];
  return {
    stages: ordered,
    contributors,
    asOf: raw.as_of || null,
    partial,
  };
}

export function transformDeadlineRadar(raw = {}, cutoff) {
  const buckets = Array.isArray(raw.buckets) ? raw.buckets : [];
  const now = new Date();
  return {
    buckets: buckets.map((bucket) => ({
      range: bucket.range,
      count: Number(bucket.count) || 0,
      urgent: isUrgentBucket(bucket.range),
    })),
    cutoff,
    generatedAt: now.toISOString(),
  };
}

export function transformProviderHeatmap(raw = {}, opts = {}) {
  const providers = Array.isArray(raw.providers) ? raw.providers : [];
  const metrics = Array.isArray(raw.metrics) ? raw.metrics : [];
  const rows = Array.isArray(raw.values) ? raw.values : [];
  const normalize = Boolean(opts.normalize);

  const matrix = providers.map((provider) => {
    const entries = metrics.map((metric) => {
      const match = rows.find((row) => row.provider === provider && row.metric === metric);
      return {
        metric,
        provider,
        value: match?.value ?? null,
      };
    });
    return entries;
  });

  let zScores = null;
  if (normalize) {
    zScores = computeZScores(matrix);
  }

  return {
    providers,
    metrics,
    matrix: matrix.map((row, rowIndex) =>
      row.map((cell, columnIndex) => ({
        ...cell,
        displayValue: normalize ? zScores[rowIndex][columnIndex] : cell.value,
        rawValue: cell.value,
      }))
    ),
    sparklines: raw.sparklines || {},
    normalize,
  };
}

const computeRollingDailyAdd = (series, days) => {
  if (!series?.length || days <= 1) return 0;
  const slice = series.slice(-days);
  if (!slice.length) return 0;
  const total = slice.reduce((acc, item) => acc + (item.dailyAdd || 0), 0);
  return total / slice.length;
};

const buildTargetTrajectory = (series, target, cutoff) => {
  if (!series?.length || !target || !cutoff) return [];
  const firstDate = new Date(series[0].date);
  const lastDate = new Date(series[series.length - 1].date);
  const totalMs = cutoff.getTime() - firstDate.getTime();
  if (totalMs <= 0) return [];
  return series.map((point) => {
    const elapsed = new Date(point.date).getTime() - firstDate.getTime();
    const proportion = elapsed / totalMs;
    return {
      date: point.date,
      target: target * Math.min(1, proportion),
    };
  });
};

const detectSeriesPartial = (series, cutoff) => {
  if (!series?.length) return false;
  const latest = parseLocalDate(series[series.length - 1].date);
  const today = new Date();
  if (formatPacificDate(latest) !== formatPacificDate(today)) return true;
  if (cutoff && latest > cutoff) return false;
  return false;
};

const formatPacificDate = (value) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const parseLocalDate = (value) => new Date(`${value}T12:00:00`);

const buildRafSummary = (target, todayPoint, forecast, cutoff) => {
  if (!todayPoint) {
    return "RAF realized data unavailable.";
  }
  const realized = todayPoint.realized?.toFixed(2);
  const delta = (target - todayPoint.realized).toFixed(2);
  const forecastPoint = forecast?.[0];
  const cutoffLabel = cutoff
    ? new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(cutoff)
    : "cutoff";
  if (forecastPoint?.p50) {
    return `RAF realized is ${realized} vs target ${target.toFixed(2)}; projected to ${forecastPoint.p50.toFixed(2)} by ${cutoffLabel}.`;
  }
  return `RAF realized is ${realized} vs target ${target.toFixed(2)}; remaining delta ${delta}.`;
};

const stageLabel = (key) => {
  switch (key) {
    case "suspected":
      return "Suspected";
    case "coder_reviewed":
      return "Coder Reviewed";
    case "accepted":
      return "Accepted";
    case "submitted":
      return "Submitted";
    case "payer_accepted":
      return "Payer Accepted";
    case "on_score":
      return "Present on Score";
    default:
      return key;
  }
};

const isPartialRange = (asOf, to) => {
  if (!asOf || !to) return false;
  const asOfDate = new Date(asOf);
  const toDate = new Date(`${to}T23:59:59`);
  return asOfDate.getTime() < toDate.getTime();
};

const isUrgentBucket = (range) => {
  if (!range) return false;
  if (range === "0-3") return true;
  if (range === "4-7") return true;
  return false;
};

const computeZScores = (matrix) => {
  if (!matrix?.length) return [];
  const columns = matrix[0]?.length || 0;
  const result = Array.from({ length: matrix.length }, () => Array(columns).fill(null));
  for (let column = 0; column < columns; column += 1) {
    const values = matrix
      .map((row) => row[column]?.value)
      .filter((value) => value !== null && value !== undefined);
    if (!values.length) continue;
    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const variance =
      values.reduce((acc, value) => acc + (value - mean) ** 2, 0) / (values.length || 1);
    const stdDev = Math.sqrt(variance);
    for (let row = 0; row < matrix.length; row += 1) {
      const cellValue = matrix[row][column]?.value;
      if (cellValue === null || cellValue === undefined) {
        result[row][column] = null;
      } else if (stdDev === 0) {
        result[row][column] = 0;
      } else {
        result[row][column] = (cellValue - mean) / stdDev;
      }
    }
  }
  return result;
};

export const __private = {
  computeRollingDailyAdd,
  buildTargetTrajectory,
  detectSeriesPartial,
  computeZScores,
};
