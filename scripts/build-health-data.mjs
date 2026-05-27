import { createCipheriv, pbkdf2Sync, randomBytes } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

const DEFAULT_INPUT = path.join(homedir(), "Downloads", "export", "apple_health_export", "export.xml");
const DEFAULT_OUTPUT = path.join(process.cwd(), "health-dashboard", "data", "health-data.enc.json");
const DEFAULT_ITERATIONS = 650000;
const MIN_PASSWORD_LENGTH = 32;

const sumRecordKeys = {
  HKQuantityTypeIdentifierActiveEnergyBurned: "activeEnergy",
  HKQuantityTypeIdentifierBasalEnergyBurned: "basalEnergy",
  HKQuantityTypeIdentifierDistanceWalkingRunning: "distanceMiles",
  HKQuantityTypeIdentifierAppleExerciseTime: "exerciseMinutes",
  HKQuantityTypeIdentifierAppleStandTime: "standMinutes",
  HKQuantityTypeIdentifierFlightsClimbed: "flights",
  HKQuantityTypeIdentifierTimeInDaylight: "daylightMinutes",
  HKQuantityTypeIdentifierDietaryEnergyConsumed: "dietaryEnergy",
  HKQuantityTypeIdentifierDietaryProtein: "dietaryProtein",
  HKQuantityTypeIdentifierDietaryCarbohydrates: "dietaryCarbs",
  HKQuantityTypeIdentifierDietaryFatTotal: "dietaryFat",
  HKQuantityTypeIdentifierDietarySugar: "dietarySugar",
  HKQuantityTypeIdentifierDietaryFiber: "dietaryFiber",
  HKQuantityTypeIdentifierDietarySodium: "dietarySodium",
  HKQuantityTypeIdentifierDietaryWater: "dietaryWater"
};

const sourceDedupedRecordKeys = {
  HKQuantityTypeIdentifierStepCount: "steps"
};

const sampleRecordKeys = {
  HKQuantityTypeIdentifierHeartRate: "heartRate",
  HKQuantityTypeIdentifierRestingHeartRate: "restingHeartRate",
  HKQuantityTypeIdentifierHeartRateVariabilitySDNN: "hrv",
  HKQuantityTypeIdentifierWalkingHeartRateAverage: "walkingHeartRate",
  HKQuantityTypeIdentifierVO2Max: "vo2Max",
  HKQuantityTypeIdentifierRespiratoryRate: "respiratoryRate",
  HKQuantityTypeIdentifierOxygenSaturation: "oxygenSaturation",
  HKQuantityTypeIdentifierBodyMass: "bodyMass",
  HKQuantityTypeIdentifierBodyFatPercentage: "bodyFat",
  HKQuantityTypeIdentifierLeanBodyMass: "leanBodyMass",
  HKQuantityTypeIdentifierBodyMassIndex: "bodyMassIndex",
  HKQuantityTypeIdentifierBloodPressureSystolic: "bloodPressureSystolic",
  HKQuantityTypeIdentifierBloodPressureDiastolic: "bloodPressureDiastolic",
  HKQuantityTypeIdentifierWalkingSpeed: "walkingSpeed",
  HKQuantityTypeIdentifierWalkingStepLength: "walkingStepLength",
  HKQuantityTypeIdentifierWalkingDoubleSupportPercentage: "walkingDoubleSupport",
  HKQuantityTypeIdentifierWalkingAsymmetryPercentage: "walkingAsymmetry",
  HKQuantityTypeIdentifierAppleWalkingSteadiness: "walkingSteadiness",
  HKQuantityTypeIdentifierAppleSleepingWristTemperature: "wristTemperature"
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch (error) {
    exit(error.message);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const args = parseArgs(argv);
  const inputPath = resolveInput(args.input || DEFAULT_INPUT);
  const outputPath = path.resolve(args.out || DEFAULT_OUTPUT);
  const iterations = Number(args.iterations || DEFAULT_ITERATIONS);

  if (!existsSync(inputPath)) {
    exit(`Apple Health export not found: ${inputPath}`);
  }

  validateIterations(iterations);
  rejectCliPassword(args);

  const payload = await buildPayload(inputPath);

  if (args.dryRun) {
    console.log(JSON.stringify({
      range: payload.source.range,
      days: payload.days.length,
      records: payload.source.recordCount,
      workouts: payload.workouts.length,
      exportDate: payload.source.exportDate,
      latestDate: payload.summary.latestDate
    }, null, 2));
    return;
  }

  const password = env.HEALTH_DASHBOARD_PASSWORD;
  validatePassword(password);

  const encrypted = encryptPayload(payload, password, iterations);
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(encrypted, null, 2)}\n`);

  console.log(`Encrypted ${payload.days.length} days and ${payload.workouts.length} workouts.`);
  console.log(`Wrote ${outputPath}`);
}

export function validateIterations(iterations) {
  if (!Number.isInteger(iterations) || iterations < 300000) {
    throw new Error("Refusing to use fewer than 300000 PBKDF2 iterations.");
  }
}

export function validatePassword(password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Set HEALTH_DASHBOARD_PASSWORD to a passphrase of at least ${MIN_PASSWORD_LENGTH} characters before building the encrypted payload.`);
  }
}

export function rejectCliPassword(args) {
  if (Object.hasOwn(args, "password")) {
    throw new Error("Do not pass the dashboard password as a command-line argument. Use HEALTH_DASHBOARD_PASSWORD instead.");
  }
}

async function buildPayload(xmlPath) {
  const days = new Map();
  const workouts = [];
  let exportDate = "";
  let recordCount = 0;
  let skippedCorrelationRecords = 0;
  let insideCorrelation = false;
  let activeWorkout = null;

  const rl = readline.createInterface({
    input: createReadStream(xmlPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes("<ExportDate ")) {
      exportDate = parseAttributes(line).value || exportDate;
      continue;
    }

    if (line.includes("<Correlation ")) {
      insideCorrelation = true;
    }

    if (line.includes("</Correlation>")) {
      insideCorrelation = false;
      continue;
    }

    if (line.includes("<Workout ")) {
      activeWorkout = parseWorkout(parseAttributes(line));
      continue;
    }

    if (activeWorkout && line.includes("<WorkoutStatistics ")) {
      addWorkoutStatistic(activeWorkout, parseAttributes(line));
      continue;
    }

    if (activeWorkout && line.includes("</Workout>")) {
      workouts.push(finalizeWorkout(activeWorkout));
      activeWorkout = null;
      continue;
    }

    if (line.includes("<ActivitySummary ")) {
      addActivitySummary(days, parseAttributes(line));
      continue;
    }

    if (line.includes("<Record ")) {
      if (insideCorrelation) {
        skippedCorrelationRecords += 1;
        continue;
      }
      recordCount += 1;
      addRecord(days, parseAttributes(line));
    }
  }

  const finalizedDays = finalizeDays(days);
  const workoutSummary = summarizeWorkouts(workouts);
  const range = {
    start: finalizedDays[0]?.date || "",
    end: finalizedDays.at(-1)?.date || ""
  };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      exportDate,
      range,
      recordCount,
      skippedCorrelationRecords,
      workoutCount: workouts.length,
      privacy: "Daily aggregates and workout summaries only. Raw XML, ECG files, and GPS routes are excluded."
    },
    summary: {
      latestDate: range.end,
      totalDays: finalizedDays.length,
      totals: totalsFor(finalizedDays)
    },
    days: finalizedDays,
    workouts,
    workoutSummary
  };
}

function addRecord(days, attrs) {
  const type = attrs.type;
  if (!type) return;

  if (type === "HKCategoryTypeIdentifierSleepAnalysis") {
    addSleep(days, attrs);
    return;
  }

  if (type === "HKCategoryTypeIdentifierMindfulSession") {
    const date = dayKey(attrs.startDate);
    if (!date) return;
    const day = ensureDay(days, date);
    addTotal(day, "mindfulMinutes", durationMinutes(attrs.startDate, attrs.endDate));
    return;
  }

  if (type === "HKCategoryTypeIdentifierAppleStandHour") {
    if (attrs.value === "HKCategoryValueAppleStandHourStood") {
      const date = dayKey(attrs.startDate);
      if (!date) return;
      addTotal(ensureDay(days, date), "standHoursFromRecords", 1);
    }
    return;
  }

  const numeric = Number(attrs.value);
  if (!Number.isFinite(numeric)) return;
  const date = dayKey(attrs.startDate);
  if (!date) return;
  const day = ensureDay(days, date);
  const normalized = normalizeQuantity(type, attrs.unit, numeric);

  const sourceDedupedKey = sourceDedupedRecordKeys[type];
  if (sourceDedupedKey) {
    addSourceDedupedTotal(day, sourceDedupedKey, normalized.value, attrs);
    return;
  }

  const sumKey = sumRecordKeys[type];
  if (sumKey) {
    addTotal(day, sumKey, normalized.value);
    return;
  }

  const sampleKey = sampleRecordKeys[type];
  if (sampleKey) {
    addSample(day, sampleKey, normalized.value, normalized.unit);
  }
}

function addSleep(days, attrs) {
  const minutes = durationMinutes(attrs.startDate, attrs.endDate);
  if (!minutes) return;
  const date = dayKey(attrs.endDate || attrs.startDate);
  if (!date) return;
  const day = ensureDay(days, date);
  const value = attrs.value || "";
  day.sleep.records += 1;
  if (value.includes("Asleep")) {
    day.sleep.asleepMinutes += minutes;
  } else if (value.includes("InBed")) {
    day.sleep.inBedMinutes += minutes;
  } else if (value.includes("Awake")) {
    day.sleep.awakeMinutes += minutes;
  }
}

function addActivitySummary(days, attrs) {
  const date = attrs.dateComponents;
  if (!date) return;
  const day = ensureDay(days, date);
  day.activity = {
    activeEnergyBurned: round(Number(attrs.activeEnergyBurned), 1),
    activeEnergyGoal: round(Number(attrs.activeEnergyBurnedGoal), 1),
    exerciseMinutes: round(Number(attrs.appleExerciseTime), 1),
    exerciseGoal: round(Number(attrs.appleExerciseTimeGoal), 1),
    standHours: round(Number(attrs.appleStandHours), 1),
    standGoal: round(Number(attrs.appleStandHoursGoal), 1)
  };
}

function parseWorkout(attrs) {
  return {
    date: dayKey(attrs.startDate),
    startDate: attrs.startDate || "",
    endDate: attrs.endDate || "",
    type: cleanWorkoutType(attrs.workoutActivityType),
    durationMinutes: normalizeWorkoutDuration(attrs.duration, attrs.durationUnit),
    activeEnergy: 0,
    basalEnergy: 0,
    distanceMiles: 0
  };
}

function addWorkoutStatistic(workout, attrs) {
  const type = attrs.type;
  const sum = Number(attrs.sum);
  if (!Number.isFinite(sum)) return;
  const normalized = normalizeQuantity(type, attrs.unit, sum);
  if (type === "HKQuantityTypeIdentifierActiveEnergyBurned") {
    workout.activeEnergy += normalized.value;
  } else if (type === "HKQuantityTypeIdentifierBasalEnergyBurned") {
    workout.basalEnergy += normalized.value;
  } else if (type === "HKQuantityTypeIdentifierDistanceWalkingRunning" || type === "HKQuantityTypeIdentifierDistanceCycling" || type === "HKQuantityTypeIdentifierDistanceSwimming") {
    workout.distanceMiles += normalized.value;
  }
}

function finalizeWorkout(workout) {
  return {
    ...workout,
    activeEnergy: round(workout.activeEnergy, 1),
    basalEnergy: round(workout.basalEnergy, 1),
    distanceMiles: round(workout.distanceMiles, 2)
  };
}

function finalizeDays(days) {
  return Array.from(days.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      applySourceDedupedTotals(day);

      if (day.activity) {
        if (!day.totals.activeEnergy && day.activity.activeEnergyBurned) {
          day.totals.activeEnergy = day.activity.activeEnergyBurned;
        }
        if (!day.totals.exerciseMinutes && day.activity.exerciseMinutes) {
          day.totals.exerciseMinutes = day.activity.exerciseMinutes;
        }
        day.totals.standHours = day.activity.standHours ?? day.totals.standHoursFromRecords;
      } else if (day.totals.standHoursFromRecords) {
        day.totals.standHours = day.totals.standHoursFromRecords;
      }

      const samples = {};
      Object.entries(day.sampleAcc).forEach(([key, value]) => {
        samples[key] = {
          avg: round(value.sum / value.count, value.unit === "lb" ? 1 : 2),
          min: round(value.min, value.unit === "lb" ? 1 : 2),
          max: round(value.max, value.unit === "lb" ? 1 : 2),
          count: value.count,
          unit: value.unit
        };
      });

      const sleep = {};
      if (day.sleep.records) {
        sleep.asleepHours = round(day.sleep.asleepMinutes / 60, 2);
        sleep.inBedHours = round(day.sleep.inBedMinutes / 60, 2);
        sleep.awakeMinutes = round(day.sleep.awakeMinutes, 1);
        const sleepWindow = day.sleep.inBedMinutes || (day.sleep.asleepMinutes + day.sleep.awakeMinutes);
        sleep.efficiency = sleepWindow ? round((day.sleep.asleepMinutes / sleepWindow) * 100, 1) : null;
        sleep.records = day.sleep.records;
      }

      return {
        date: day.date,
        totals: roundObject(day.totals),
        samples,
        sleep,
        activity: day.activity
      };
    });
}

function summarizeWorkouts(workouts) {
  const summary = new Map();
  workouts.forEach((workout) => {
    const item = summary.get(workout.type) || {
      type: workout.type,
      count: 0,
      minutes: 0,
      activeEnergy: 0,
      distanceMiles: 0,
      lastDate: workout.date
    };
    item.count += 1;
    item.minutes += workout.durationMinutes || 0;
    item.activeEnergy += workout.activeEnergy || 0;
    item.distanceMiles += workout.distanceMiles || 0;
    if (workout.date > item.lastDate) item.lastDate = workout.date;
    summary.set(workout.type, item);
  });
  return Array.from(summary.values())
    .map((item) => ({
      ...item,
      minutes: round(item.minutes, 1),
      activeEnergy: round(item.activeEnergy, 1),
      distanceMiles: round(item.distanceMiles, 2)
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function totalsFor(days) {
  const totals = {};
  days.forEach((day) => {
    Object.entries(day.totals).forEach(([key, value]) => {
      totals[key] = (totals[key] || 0) + value;
    });
  });
  return roundObject(totals);
}

function ensureDay(days, date) {
  if (!days.has(date)) {
    days.set(date, {
      date,
      totals: {},
      sampleAcc: {},
      sleep: {
        asleepMinutes: 0,
        inBedMinutes: 0,
        awakeMinutes: 0,
        records: 0
      },
      activity: null,
      sourceDedupedTotals: {}
    });
  }
  return days.get(date);
}

function addTotal(day, key, value) {
  if (!Number.isFinite(value)) return;
  day.totals[key] = (day.totals[key] || 0) + value;
}

function addSourceDedupedTotal(day, key, value, attrs) {
  if (!Number.isFinite(value)) return;
  const totals = day.sourceDedupedTotals[key] || new Map();
  const source = sourceKey(attrs);
  totals.set(source, (totals.get(source) || 0) + value);
  day.sourceDedupedTotals[key] = totals;
}

function applySourceDedupedTotals(day) {
  Object.entries(day.sourceDedupedTotals).forEach(([key, sourceTotals]) => {
    const preferred = preferredSourceTotal(sourceTotals);
    if (preferred !== null) {
      day.totals[key] = preferred;
    }
  });
}

function preferredSourceTotal(sourceTotals) {
  const ranked = Array.from(sourceTotals.entries())
    .filter(([, value]) => Number.isFinite(value))
    .sort(([sourceA, valueA], [sourceB, valueB]) => {
      const rankDelta = sourcePriority(sourceA) - sourcePriority(sourceB);
      return rankDelta || valueB - valueA;
    });
  return ranked[0]?.[1] ?? null;
}

function addSample(day, key, value, unit) {
  if (!Number.isFinite(value)) return;
  const sample = day.sampleAcc[key] || {
    sum: 0,
    count: 0,
    min: value,
    max: value,
    unit
  };
  sample.sum += value;
  sample.count += 1;
  sample.min = Math.min(sample.min, value);
  sample.max = Math.max(sample.max, value);
  sample.unit = unit || sample.unit;
  day.sampleAcc[key] = sample;
}

function normalizeQuantity(type, unit, value) {
  if (unit === "km") return { value: value * 0.621371, unit: "mi" };
  if (unit === "m") {
    if (type === "HKQuantityTypeIdentifierSixMinuteWalkTestDistance") return { value: value * 3.28084, unit: "ft" };
    return { value: value * 0.000621371, unit: "mi" };
  }
  if (unit === "yd") return { value: value / 1760, unit: "mi" };
  if (unit === "%") return { value: value <= 1 ? value * 100 : value, unit: "%" };
  return { value, unit: unit || "" };
}

function sourceKey(attrs) {
  return attrs.sourceName || attrs.device || "Unknown source";
}

function sourcePriority(source) {
  if (/watch/i.test(source)) return 0;
  if (/iphone/i.test(source)) return 1;
  return 2;
}

function parseAttributes(line) {
  const attrs = {};
  const pattern = /([A-Za-z0-9_:-]+)="([^"]*)"/g;
  let match = pattern.exec(line);
  while (match) {
    attrs[match[1]] = decodeEntities(match[2]);
    match = pattern.exec(line);
  }
  return attrs;
}

function decodeEntities(value) {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function dayKey(value) {
  return value ? value.slice(0, 10) : "";
}

function durationMinutes(start, end) {
  const startDate = parseAppleDate(start);
  const endDate = parseAppleDate(end);
  if (!startDate || !endDate) return 0;
  return Math.max(0, (endDate.getTime() - startDate.getTime()) / 60000);
}

function normalizeWorkoutDuration(value, unit = "min") {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return 0;
  const normalizedUnit = unit.toLowerCase();
  if (normalizedUnit === "s" || normalizedUnit === "sec" || normalizedUnit === "second" || normalizedUnit === "seconds") {
    return round(duration / 60, 1);
  }
  if (normalizedUnit === "h" || normalizedUnit === "hr" || normalizedUnit === "hour" || normalizedUnit === "hours") {
    return round(duration * 60, 1);
  }
  if (normalizedUnit === "d" || normalizedUnit === "day" || normalizedUnit === "days") {
    return round(duration * 1440, 1);
  }
  return round(duration, 1);
}

function parseAppleDate(value) {
  if (!value) return null;
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!match) return null;
  return new Date(`${match[1]}T${match[2]}${match[3]}:${match[4]}`);
}

function cleanWorkoutType(value = "") {
  return value
    .replace("HKWorkoutActivityType", "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim() || "Workout";
}

function roundObject(input) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, round(value, 2)]));
}

function round(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function encryptPayload(payload, password, iterations) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
  return {
    schema: "health-dashboard-encrypted/v1",
    generatedAt: new Date().toISOString(),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations,
      salt: salt.toString("base64")
    },
    cipher: {
      name: "AES-GCM",
      iv: iv.toString("base64")
    },
    data: encrypted.toString("base64")
  };
}

function resolveInput(input) {
  const resolved = path.resolve(input);
  return resolved.endsWith(".xml") ? resolved : path.join(resolved, "export.xml");
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      parsed.dryRun = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      parsed[key] = argv[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function exit(message) {
  console.error(message);
  process.exit(1);
}
