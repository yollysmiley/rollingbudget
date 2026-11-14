/* Converts Release 2 budget_data.state into the redesigned year-row format. */
(function (root) {
  "use strict";

  const MONTHS = [
    ["January", "JAN"], ["February", "FEB"], ["March", "MAR"], ["April", "APR"],
    ["May", "MAY"], ["June", "JUNE"], ["July", "JULY"], ["August", "AUG"],
    ["September", "SEPT"], ["October", "OCT"], ["November", "NOV"], ["December", "DEC"]
  ];

  function amount(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function categoryForExpense(category) {
    const normalized = String(category || "").trim().toLowerCase();
    if (normalized === "fixed expenses" || normalized === "fixed") return "fixed";
    if (normalized === "credit cards" || normalized === "credit card" || normalized === "cc") return "creditCards";
    if (normalized === "loans" || normalized === "loan") return "loans";
    return "variable";
  }

  function categoryForRule(category) {
    const normalized = String(category || "").trim().toLowerCase();
    if (normalized === "fixed expenses" || normalized === "fixed") return "fixed";
    if (normalized === "variable expenses" || normalized === "variable") return "variable";
    if (normalized === "credit cards" || normalized === "credit card" || normalized === "cc") return "cc";
    if (normalized === "loans" || normalized === "loan") return "loan";
    if (normalized === "income") return "income";
    return "variable";
  }

  function toYearData(legacyYear) {
    if (!legacyYear || typeof legacyYear !== "object" || !Array.isArray(legacyYear.months)) {
      throw new Error("Legacy budget year is missing its months array.");
    }
    if (legacyYear.months.length !== 12) {
      throw new Error("Legacy budget year must contain exactly 12 months.");
    }

    const recurring = Array.isArray(legacyYear.recurring) ? legacyYear.recurring : [];
    const recurringRules = recurring.map((rule, index) => ({
      id: "legacy-rec-" + index,
      cat: categoryForRule(rule.category),
      name: String(rule.name || "Unnamed recurring item"),
      amount: amount(rule.amount),
      due: rule.dueDay == null ? "" : String(rule.dueDay),
      acct: "cpm",
      startMonth: 0,
      frequency: "monthly",
      active: true,
      legacyCategory: rule.category || null,
      legacyRecurring: { ...rule }
    }));

    const months = legacyYear.months.map((legacyMonth, index) => {
      const source = legacyMonth && typeof legacyMonth === "object" ? legacyMonth : {};
      const monthName = String(source.name || MONTHS[index][0]);
      const mapped = {
        code: MONTHS[index][1],
        name: monthName,
        recordedLeftover: amount(source.startRollover),
        income: [],
        fixed: [],
        variable: [],
        creditCards: [],
        loans: [],
        legacyMetadata: {
          startRollover: source.startRollover ?? null,
          endRollover: source.endRollover ?? null,
          monthIncome: source.monthIncome ?? null,
          monthExpenses: source.monthExpenses ?? null,
          excludedTotal: source.excludedTotal ?? null,
          availableAfterExcluded: source.availableAfterExcluded ?? null,
          excludedBuckets: Array.isArray(source.excludedBuckets) ? source.excludedBuckets : []
        }
      };

      (Array.isArray(source.paychecks) ? source.paychecks : []).forEach((paycheck) => {
        const record = paycheck && typeof paycheck === "object" ? paycheck : {};
        const paycheckAmount = amount(record.amount);
        mapped.income.push({
          name: String(record.name || "Legacy paycheck"),
          cpm: paycheckAmount,
          usaa: 0,
          legacyAccountUnassigned: true,
          legacyPaycheck: { ...record }
        });
      });

      (Array.isArray(source.expenses) ? source.expenses : []).forEach((expense) => {
        const record = expense && typeof expense === "object" ? expense : {};
        const target = categoryForExpense(record.category);
        const item = {
          name: String(record.name || "Unnamed expense"),
          due: record.dueDay == null ? "" : String(record.dueDay),
          legacyCategory: record.category || null,
          legacyBucketIndex: record.bucketIndex ?? null,
          legacyFromRecurring: Boolean(record.fromRecurring),
          legacyExpense: { ...record }
        };
        const value = amount(record.amount);
        if (target === "fixed" || target === "variable") {
          mapped[target].push({ ...item, amount: value });
        } else if (target === "creditCards") {
          mapped.creditCards.push({ ...item, statement: 0, apr: 0, payment: value });
        } else {
          mapped.loans.push({ ...item, balance: 0, apr: 0, payment: value });
        }
      });

      return mapped;
    });

    return {
      autoCascade: true,
      recurringRules,
      months,
      legacyMetadata: {
        activeMonthIndex: Number.isInteger(legacyYear.activeMonth) ? legacyYear.activeMonth : 0,
        sourceFormat: "release2-budget_data"
      }
    };
  }

  function convertLegacyStateToYearRows(state, userId, updatedAt) {
    if (!state || typeof state !== "object" || !Array.isArray(state.years) || !state.years.length) {
      throw new Error("Legacy budget state does not contain any years.");
    }
    const seen = new Set();
    return state.years.map((legacyYear) => {
      const year = Number(legacyYear && legacyYear.year);
      if (!Number.isInteger(year) || year < 1900 || year > 2200) {
        throw new Error("Legacy budget contains an invalid year.");
      }
      if (seen.has(year)) throw new Error("Legacy budget contains duplicate years.");
      seen.add(year);
      const budgetData = toYearData({
        ...legacyYear,
        recurring: Array.isArray(state.recurring) ? state.recurring : []
      });
      return {
        user_id: userId,
        year,
        budget_data: budgetData,
        updated_at: updatedAt || new Date().toISOString()
      };
    });
  }

  root.convertLegacyStateToYearRows = convertLegacyStateToYearRows;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { convertLegacyStateToYearRows };
  }
})(typeof window !== "undefined" ? window : globalThis);
