const test = require("node:test");
const assert = require("node:assert/strict");
const sdk = require("../dist/recurring-investing");
const at = (value) => Date.parse(value) / 1000;
const schedule = (overrides = {}) => ({
  unit: "day",
  interval: 1,
  startsAt: at("2026-01-31T10:30:00Z"),
  occurrences: 12,
  ...overrides,
});

test("calendar-month investing clamps month ends without changing the original day or UTC time", () => {
  const plan = schedule({ unit: "month", occurrences: 4 });
  assert.deepEqual(
    Array.from({ length: 4 }, (_, index) =>
      new Date(sdk.scheduleAt(plan, index) * 1000).toISOString(),
    ),
    [
      "2026-01-31T10:30:00.000Z",
      "2026-02-28T10:30:00.000Z",
      "2026-03-31T10:30:00.000Z",
      "2026-04-30T10:30:00.000Z",
    ],
  );
  const leap = schedule({
    unit: "month",
    startsAt: at("2028-01-31T10:30:00Z"),
    occurrences: 3,
  });
  assert.equal(sdk.scheduleAt(leap, 1), at("2028-02-29T10:30:00Z"));
  assert.equal(sdk.scheduleAt(leap, 2), at("2028-03-31T10:30:00Z"));
});

test("daily, weekly and custom intervals remain at the selected UTC hour across DST changes", () => {
  const daily = schedule({ startsAt: at("2026-03-07T07:00:00Z") });
  assert.equal(sdk.scheduleAt(daily, 3), at("2026-03-10T07:00:00Z"));
  const fortnightly = schedule({ unit: "week", interval: 2 });
  assert.equal(sdk.scheduleAt(fortnightly, 2), at("2026-02-28T10:30:00Z"));
  const quarterly = schedule({ unit: "month", interval: 3, occurrences: 4 });
  assert.equal(sdk.scheduleAt(quarterly, 3), at("2026-10-31T10:30:00Z"));
  assert.equal(sdk.recurringScheduleLabel(fortnightly), "Every 2 weeks");
  assert.equal(
    sdk.recurringScheduleLabel(schedule({ unit: "month" })),
    "Monthly",
  );
});

test("due work skips missed runs and stops exactly at the six-hour execution window", () => {
  const plan = schedule();
  assert.equal(sdk.dueScheduleOccurrence(plan, plan.startsAt - 1), null);
  const third = sdk.scheduleAt(plan, 2);
  assert.deepEqual(sdk.dueScheduleOccurrence(plan, third), {
    index: 2,
    scheduledAt: third,
  });
  assert.equal(
    sdk.dueScheduleOccurrence(
      plan,
      third + sdk.RECURRENCE_EXECUTION_WINDOW_SECONDS,
    ),
    null,
  );
  assert.deepEqual(
    sdk.dueScheduleOccurrence(
      plan,
      third + sdk.RECURRENCE_EXECUTION_WINDOW_SECONDS - 1,
    ),
    { index: 2, scheduledAt: third },
  );
  assert.equal(
    sdk.dueScheduleOccurrence(plan, sdk.recurringScheduleEndsAt(plan)),
    null,
  );
  assert.equal(
    sdk.dueScheduleOccurrence(
      plan,
      sdk.recurringScheduleEndsAt(plan) + 365 * 86400,
    ),
    null,
  );
});

test("next occurrence has explicit boundary semantics and finite ending", () => {
  const plan = schedule({ occurrences: 2 });
  assert.deepEqual(sdk.nextScheduleOccurrence(plan, plan.startsAt - 1), {
    index: 0,
    scheduledAt: plan.startsAt,
  });
  assert.deepEqual(sdk.nextScheduleOccurrence(plan, plan.startsAt), {
    index: 1,
    scheduledAt: sdk.scheduleAt(plan, 1),
  });
  assert.deepEqual(
    sdk.nextScheduleOccurrence(plan, plan.startsAt, { inclusive: true }),
    { index: 0, scheduledAt: plan.startsAt },
  );
  assert.equal(sdk.nextScheduleOccurrence(plan, sdk.scheduleAt(plan, 1)), null);
});

test("monthly authorization exposure is calculated from fixed periods with a one-year maximum", () => {
  const plan = schedule({ unit: "month", occurrences: 12 });
  const permission = sdk.deriveRecurringPermissionWindow(plan);
  assert.equal(permission.periodSeconds, 28 * 86400);
  assert.equal(permission.maximumCollections, 12);
  // Thirteen monthly purchases plus their final execution window exceed the authorization horizon.
  const shifted = schedule({
    unit: "month",
    startsAt: at("2026-03-31T10:30:00Z"),
    occurrences: 13,
  });
  assert.throws(
    () => sdk.deriveRecurringPermissionWindow(shifted),
    /within one year/,
  );
  const longCalendar = schedule({
    unit: "month",
    startsAt: at("2027-02-01T10:30:00Z"),
    occurrences: 12,
  });
  const longPermission = sdk.deriveRecurringPermissionWindow(longCalendar);
  assert.equal(longPermission.maximumCollections, 12);
  assert.equal(sdk.maximumRecurringExposure("1000000", plan), 12000000n);
});

test("permission covers each selected occurrence with an expiring bounded cap", () => {
  for (const unit of ["day", "week", "month"]) {
    const plan = schedule({ unit, occurrences: 8 });
    const permission = sdk.deriveRecurringPermissionWindow(plan);
    assert.equal(permission.startsAt, plan.startsAt);
    assert.equal(permission.expiresAt, sdk.scheduleAt(plan, 7) + 6 * 3600);
    let previousPeriod = -1;
    for (let index = 0; index < plan.occurrences; index += 1) {
      const period = Math.floor(
        (sdk.scheduleAt(plan, index) - permission.startsAt) /
          permission.periodSeconds,
      );
      assert.ok(period > previousPeriod);
      assert.ok(period < permission.maximumCollections);
      previousPeriod = period;
    }
  }
  assert.equal(
    sdk.deriveRecurringPermissionWindow(
      schedule({ unit: "month", occurrences: 1 }),
    ).periodSeconds,
    28 * 86400,
  );
});

test("invalid schedules and out-of-range budgets fail before authorization", () => {
  for (const overrides of [
    { unit: "year" },
    { interval: 0 },
    { interval: 1.5 },
    { interval: 13 },
    { occurrences: 0 },
    { occurrences: 366 },
    { startsAt: NaN },
    { startsAt: -1 },
  ])
    assert.throws(() =>
      sdk.deriveRecurringPermissionWindow(schedule(overrides)),
    );
  assert.throws(
    () =>
      sdk.deriveRecurringPermissionWindow(
        schedule({ unit: "week", occurrences: 54 }),
      ),
    /within one year/,
  );
  assert.throws(() => sdk.scheduleAt(schedule(), 12), /outside/);
  for (const amount of ["0", "1.5", "-1", "01", "18446744073709551616"])
    assert.throws(() => sdk.maximumRecurringExposure(amount, schedule()));
});

test("UTC input parsing rejects invalid calendar rollover and timezone-ambiguous text", () => {
  const timestamp = sdk.parseUtcScheduleInput("2028-02-29T14:15");
  assert.equal(timestamp, at("2028-02-29T14:15:00Z"));
  assert.equal(sdk.utcScheduleInput(timestamp), "2028-02-29T14:15");
  for (const input of [
    "2027-02-29T14:15",
    "2026-04-31T14:15",
    "2026-01-01T24:00",
    "2026-01-01 14:15",
    "2026-01-01T14:15Z",
    "2026-01-01T14:15-05:00",
  ])
    assert.throws(() => sdk.parseUtcScheduleInput(input), /UTC/);
});
