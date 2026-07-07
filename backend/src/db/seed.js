// Idempotent seed: safe to run multiple times (INSERT OR IGNORE on unique name/category).
const db = require('./index');
const logger = require('../../utils/logger');

const INDUSTRIES = [
  'Automobiles & Auto Components', 'Banking', 'NBFC & Financial Services', 'Insurance',
  'Asset Management & Broking', 'IT Services', 'Software & SaaS', 'Pharmaceuticals',
  'Healthcare & Hospitals', 'Diagnostics', 'FMCG', 'Consumer Durables', 'Retail',
  'E-commerce', 'Textiles & Apparel', 'Cement', 'Steel', 'Metals & Mining', 'Oil & Gas',
  'Power & Utilities', 'Renewable Energy', 'Capital Goods & Engineering',
  'Infrastructure & Construction', 'Real Estate', 'Chemicals', 'Specialty Chemicals',
  'Fertilizers & Agrochemicals', 'Agriculture & Agri Inputs', 'Paints', 'Telecom',
  'Media & Entertainment', 'Hotels & Tourism', 'Aviation', 'Logistics & Shipping',
  'Railways', 'Defence', 'Shipbuilding', 'Airports & Ports', 'Sugar', 'Paper',
  'Plastics & Packaging', 'Gems & Jewellery', 'Consumer Electronics',
];

const PROMPT_TEMPLATES = [
  {
    name: 'Industry Fundamentals',
    category: 'industry_fundamentals',
    placeholders: ['INDUSTRY NAME'],
    body: `Give me a fundamentals overview of the [INDUSTRY NAME] industry in India: market size, growth drivers, key players, regulatory environment, and cyclicality.`,
  },
  {
    name: 'Company History',
    category: 'company_history',
    placeholders: ['COMPANY NAME', 'TICKER'],
    body: `Summarize the history of [COMPANY NAME] ([TICKER]): founding, major milestones, leadership changes, and how the business has evolved.`,
  },
  {
    name: 'Bull Case',
    category: 'bull_case',
    placeholders: ['COMPANY NAME', 'TICKER', 'INDUSTRY NAME'],
    body: `Build the bull case for [COMPANY NAME] ([TICKER]) in the [INDUSTRY NAME] industry: growth catalysts, competitive moat, margin trajectory, and valuation upside.`,
  },
  {
    name: 'Bear Case',
    category: 'bear_case',
    placeholders: ['COMPANY NAME', 'TICKER', 'INDUSTRY NAME'],
    body: `Build the bear case for [COMPANY NAME] ([TICKER]) in the [INDUSTRY NAME] industry: key risks, competitive threats, balance sheet concerns, and valuation downside.`,
  },
  {
    name: 'Quarterly Update',
    category: 'quarterly_update',
    placeholders: ['COMPANY NAME', 'TICKER', 'QUARTER', 'FY'],
    body: `Summarize [COMPANY NAME] ([TICKER])'s [QUARTER] [FY] results: revenue, margins, PAT, YoY/QoQ trends, management commentary, and guidance changes.`,
  },
];

function seed() {
  const insertIndustry = db.prepare(`INSERT OR IGNORE INTO industries (name) VALUES (?)`);
  const insertTemplate = db.prepare(
    `INSERT OR IGNORE INTO prompt_templates (name, category, body, placeholders) VALUES (?, ?, ?, ?)`
  );

  const tx = db.transaction(() => {
    for (const name of INDUSTRIES) insertIndustry.run(name);
    for (const t of PROMPT_TEMPLATES) {
      insertTemplate.run(t.name, t.category, t.body, JSON.stringify(t.placeholders));
    }
  });
  tx();

  logger.info(`Seed complete: ${INDUSTRIES.length} industries, ${PROMPT_TEMPLATES.length} prompt templates ensured`);
}

if (require.main === module) {
  seed();
  process.exit(0);
}

module.exports = seed;
