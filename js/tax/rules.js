// ═══════════════════════════════════════════════════════════════
//  tax/rules.js — Tax (Beta) rules data, one entry per financial year
// ───────────────────────────────────────────────────────────────
//  Every rate, threshold and date the Tax module uses lives here and
//  nowhere else. Each block carries its sources, the date it was read
//  (verifiedOn) and whether it was confirmed from an ATO page or the
//  legislation (verified). Unverified figures must never be shown as final.
//
//  FY keys name the year the financial year ENDS: 'FY2026' = 2025–26.
//  Dates are 'YYYY-MM-DD'. Amounts are whole dollars.
// ═══════════════════════════════════════════════════════════════

var TAX_SRC = {
  rates:      'https://www.ato.gov.au/tax-rates-and-codes/tax-rates-australian-residents',
  medicare:   'https://www.ato.gov.au/individuals-and-families/medicare-and-private-health-insurance/medicare-levy/medicare-levy-reduction/medicare-levy-reduction-for-low-income-earners',
  agentIndiv: 'https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-for-tax-returns-by-client-type/individuals-and-trusts',
  agentList:  'https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/tax-professionals-newsroom/lodge-prior-year-returns-and-add-new-clients-by-31-october',
  weekend:    'https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/reports-and-returns/due-dates-for-lodging-and-paying',
  instalDue:  'https://www.ato.gov.au/tax-and-super-professionals/for-tax-professionals/prepare-and-lodge/registered-agent-lodgment-program/due-dates-by-obligation-type/activity-statements',
  ess30:      'https://www.ato.gov.au/law/view/print?DocID=PAC/19970038/83A-115&PiT=99991231235958',
  td20224:    'https://www.ato.gov.au/law/view/view.htm?docid=%22TXD%2FTD20224%2FNAT%2FATO%2F00001%22'
};

var TAX_RULES = {

  // Rules that do not change by year
  common: {
    medicareRate: 0.02,                 // base levy only; low-income reduction, surcharge not modelled
    essReduction: { amount: 1000, incomeTestMax: 180000 },   // label D only
    essThirtyDays: 30,                  // ITAA 1997 s 83A-115(3): "within 30 days after"
    // Whether a disposal on exactly day 30 is inside the window is NOT settled by any ATO
    // page read. The engine treats it as inside and flags days 30–31 for the user to confirm.
    essThirtyDayBoundaryVerified: false,
    instalmentDueSoonDays: 14,
    vestDefaultForeignTax: 0,
    agentPriorLiabilityThreshold: 20000, // latest return liability ≥ this → earlier agent due date
    unsureReminderDays: 14,             // unsure banner reappears this close to the self-lodge date
    weekendRule: {
      // General rule: a lodge/pay date on a Saturday, Sunday or public holiday can be met on the
      // next business day without penalty or interest. Public holidays are not modelled.
      // Exception: the agent client-list cutoff does NOT roll forward (ATO, 3 Sep 2026).
      verified: true, verifiedOn: '2026-10-04', sources: [TAX_SRC.weekend, TAX_SRC.agentList],
      note: 'Checked against a business-focused ATO page; no individual-specific wording found.'
    },
    sources: [TAX_SRC.ess30, TAX_SRC.td20224], verifiedOn: '2026-10-04', verified: true
  },

  FY2026: {
    label: '2025–26', start: '2025-07-01', end: '2026-06-30',
    // Resident scale. Each bracket: income above `from` taxed at `rate`.
    brackets: [
      { from: 0,      rate: 0    },
      { from: 18200,  rate: 0.16 },
      { from: 45000,  rate: 0.30 },
      { from: 135000, rate: 0.37 },
      { from: 190000, rate: 0.45 }
    ],
    standardDeduction: 0,               // not available for 2025–26
    medicareLowIncome: { single: { lower: 28011, upper: 35013 }, singleSapto: { lower: 44268, upper: 55335 }, modelled: false },
    // Quarterly PAYG instalments: 28th of the month after each quarter; Q2 is 28 Feb.
    instalments: [
      { q: 1, period: 'Jul–Sep', due: '2025-10-28' },
      { q: 2, period: 'Oct–Dec', due: '2026-02-28' },
      { q: 3, period: 'Jan–Mar', due: '2026-04-28' },
      { q: 4, period: 'Apr–Jun', due: '2026-07-28' }
    ],
    lodgement: {
      selfDue: '2026-10-31',
      selfPaymentDaysAfterDue: 21,      // estimate; the notice of assessment is authoritative
      agentListCutoff: '2026-10-31',    // no weekend rollover
      agentPriorLiabilityDue: '2027-03-31',   // latest return liability ≥ $20,000
      agentDue: '2027-05-15',           // all remaining individuals
      agentConcessionDue: '2027-06-05', // lodge AND pay by this date
      // Returns due 15 May: payment by lodgment date. `to` is inclusive.
      agentPaymentBands: [
        { to: '2027-02-12', pay: '2027-03-21' },
        { to: '2027-03-12', pay: '2027-04-21' },
        { to: null,         pay: '2027-06-05' }
      ],
      // Returns not due 15 May: later of 21 days after the due date, or the notice being
      // deemed received (7 business days after issue).
      otherPaymentDaysAfterDue: 21,
      verified: true, verifiedOn: '2026-10-04', sources: [TAX_SRC.agentIndiv, TAX_SRC.agentList]
    },
    // Scale and standard deduction verified in the v4 spec (3 Oct 2026); Medicare thresholds 4 Oct 2026
    sources: [TAX_SRC.rates, TAX_SRC.medicare, TAX_SRC.instalDue], verifiedOn: '2026-10-03', verified: true
  },

  FY2027: {
    label: '2026–27', start: '2026-07-01', end: '2027-06-30',
    brackets: [
      { from: 0,      rate: 0    },
      { from: 18200,  rate: 0.15 },
      { from: 45000,  rate: 0.30 },
      { from: 135000, rate: 0.37 },
      { from: 190000, rate: 0.45 }
    ],
    standardDeduction: 1000,            // first available 2026–27
    medicareLowIncome: null,            // 2026–27 thresholds not yet read
    instalments: [
      { q: 1, period: 'Jul–Sep', due: '2026-10-28' },
      { q: 2, period: 'Oct–Dec', due: '2027-02-28' },
      { q: 3, period: 'Jan–Mar', due: '2027-04-28' },
      { q: 4, period: 'Apr–Jun', due: '2027-07-28' }
    ],
    // The 2027–28 agent lodgment program is not published yet. Only the self-lodge date is
    // known; agent dates stay null until the ATO publishes them.
    lodgement: {
      selfDue: '2027-10-31',
      selfPaymentDaysAfterDue: 21,
      agentListCutoff: null,
      agentPriorLiabilityDue: null,
      agentDue: null,
      agentConcessionDue: null,
      agentPaymentBands: null,
      otherPaymentDaysAfterDue: 21,
      verified: false, verifiedOn: null, sources: []
    },
    sources: [TAX_SRC.rates, TAX_SRC.instalDue], verifiedOn: '2026-10-03', verified: true
  }
};

// Every FY the module knows about, oldest first
var TAX_FYS = ['FY2026', 'FY2027'];
