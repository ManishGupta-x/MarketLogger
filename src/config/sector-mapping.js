/**
 * NSE Stock Sector Mapping
 * Maps major NSE stocks to their sectors for diversification
 *
 * Sectors:
 * - BANKING: Banks (private and public)
 * - NBFC: Non-Banking Financial Companies
 * - IT: Information Technology
 * - PHARMA: Pharmaceuticals and Healthcare
 * - AUTO: Automobiles and Auto Components
 * - FMCG: Fast Moving Consumer Goods
 * - ENERGY: Oil, Gas, Power, Coal
 * - METAL: Steel, Aluminum, Mining
 * - INFRA: Infrastructure, Construction, Cement
 * - TELECOM: Telecom Services
 * - REALTY: Real Estate
 * - MEDIA: Media and Entertainment
 * - CONSUMER: Consumer Durables and Discretionary
 * - CHEMICAL: Chemicals and Fertilizers
 * - INSURANCE: Insurance Companies
 * - OTHER: Unclassified
 */

const SECTOR_MAPPING = {
  // BANKING - Private Banks
  'HDFCBANK': 'BANKING',
  'ICICIBANK': 'BANKING',
  'KOTAKBANK': 'BANKING',
  'AXISBANK': 'BANKING',
  'INDUSINDBK': 'BANKING',
  'BANDHANBNK': 'BANKING',
  'IDFCFIRSTB': 'BANKING',
  'FEDERALBNK': 'BANKING',
  'RBLBANK': 'BANKING',
  'YESBANK': 'BANKING',
  'AUBANK': 'BANKING',
  'CSBBANK': 'BANKING',
  'KARURVYSYA': 'BANKING',
  'DCBBANK': 'BANKING',

  // BANKING - Public Sector Banks
  'SBIN': 'BANKING',
  'BANKBARODA': 'BANKING',
  'PNB': 'BANKING',
  'CANBK': 'BANKING',
  'UNIONBANK': 'BANKING',
  'BANKINDIA': 'BANKING',
  'INDIANB': 'BANKING',
  'IOB': 'BANKING',
  'CENTRALBK': 'BANKING',
  'UCOBANK': 'BANKING',
  'MAHABANK': 'BANKING',
  'PSB': 'BANKING',
  'J&KBANK': 'BANKING',

  // NBFC
  'BAJFINANCE': 'NBFC',
  'BAJAJFINSV': 'NBFC',
  'HDFCLIFE': 'NBFC',
  'SBILIFE': 'NBFC',
  'ICICIGI': 'NBFC',
  'CHOLAFIN': 'NBFC',
  'M&MFIN': 'NBFC',
  'SHRIRAMFIN': 'NBFC',
  'MUTHOOTFIN': 'NBFC',
  'LICHSGFIN': 'NBFC',
  'MANAPPURAM': 'NBFC',
  'POONAWALLA': 'NBFC',
  'LTFH': 'NBFC',
  'CANFINHOME': 'NBFC',

  // IT
  'TCS': 'IT',
  'INFY': 'IT',
  'HCLTECH': 'IT',
  'WIPRO': 'IT',
  'TECHM': 'IT',
  'LTIM': 'IT',
  'MPHASIS': 'IT',
  'COFORGE': 'IT',
  'PERSISTENT': 'IT',
  'LTTS': 'IT',
  'MINDTREE': 'IT',
  'NIITLTD': 'IT',
  'TATAELXSI': 'IT',
  'CYIENT': 'IT',
  'ZENSARTECH': 'IT',
  'TANLA': 'IT',
  'ROUTE': 'IT',
  'HAPPSTMNDS': 'IT',
  'KPITTECH': 'IT',
  'SONATSOFTW': 'IT',
  'BIRLASOFT': 'IT',
  'MASTEK': 'IT',
  'INTELLECT': 'IT',

  // PHARMA
  'SUNPHARMA': 'PHARMA',
  'DRREDDY': 'PHARMA',
  'CIPLA': 'PHARMA',
  'DIVISLAB': 'PHARMA',
  'LUPIN': 'PHARMA',
  'AUROPHARMA': 'PHARMA',
  'BIOCON': 'PHARMA',
  'TORNTPHARM': 'PHARMA',
  'ALKEM': 'PHARMA',
  'ZYDUSLIFE': 'PHARMA',
  'ABBOTINDIA': 'PHARMA',
  'GLAXO': 'PHARMA',
  'PFIZER': 'PHARMA',
  'SANOFI': 'PHARMA',
  'GLENMARK': 'PHARMA',
  'IPCALAB': 'PHARMA',
  'LAURUSLABS': 'PHARMA',
  'NATCOPHARM': 'PHARMA',
  'LALPATHLAB': 'PHARMA',
  'METROPOLIS': 'PHARMA',
  'APOLLOHOSP': 'PHARMA',
  'MAXHEALTH': 'PHARMA',
  'FORTIS': 'PHARMA',

  // AUTO
  'MARUTI': 'AUTO',
  'TATAMOTORS': 'AUTO',
  'M&M': 'AUTO',
  'BAJAJ-AUTO': 'AUTO',
  'HEROMOTOCO': 'AUTO',
  'EICHERMOT': 'AUTO',
  'ASHOKLEY': 'AUTO',
  'TVSMOTOR': 'AUTO',
  'ESCORTS': 'AUTO',
  'BHARATFORG': 'AUTO',
  'BOSCHLTD': 'AUTO',
  'MOTHERSON': 'AUTO',
  'MRF': 'AUTO',
  'APOLLOTYRE': 'AUTO',
  'BALKRISIND': 'AUTO',
  'CEATLTD': 'AUTO',
  'EXIDEIND': 'AUTO',
  'AMARAJABAT': 'AUTO',
  'SONACOMS': 'AUTO',
  'SAMVARDHAN': 'AUTO',

  // FMCG
  'HINDUNILVR': 'FMCG',
  'ITC': 'FMCG',
  'NESTLEIND': 'FMCG',
  'BRITANNIA': 'FMCG',
  'DABUR': 'FMCG',
  'MARICO': 'FMCG',
  'GODREJCP': 'FMCG',
  'COLPAL': 'FMCG',
  'TATACONSUM': 'FMCG',
  'PGHH': 'FMCG',
  'EMAMILTD': 'FMCG',
  'VBL': 'FMCG',
  'RADICO': 'FMCG',
  'UNITDSPR': 'FMCG',
  'MCDOWELL-N': 'FMCG',

  // ENERGY - Oil & Gas
  'RELIANCE': 'ENERGY',
  'ONGC': 'ENERGY',
  'IOC': 'ENERGY',
  'BPCL': 'ENERGY',
  'HINDPETRO': 'ENERGY',
  'GAIL': 'ENERGY',
  'PETRONET': 'ENERGY',
  'MGL': 'ENERGY',
  'IGL': 'ENERGY',
  'GUJGASLTD': 'ENERGY',
  'OIL': 'ENERGY',
  'MRPL': 'ENERGY',
  'CHENNPETRO': 'ENERGY',

  // ENERGY - Power
  'NTPC': 'ENERGY',
  'POWERGRID': 'ENERGY',
  'ADANIPOWER': 'ENERGY',
  'TATAPOWER': 'ENERGY',
  'TORNTPOWER': 'ENERGY',
  'JSWENERGY': 'ENERGY',
  'NHPC': 'ENERGY',
  'SJVN': 'ENERGY',
  'CESC': 'ENERGY',
  'ADANIGREEN': 'ENERGY',
  'RECLTD': 'ENERGY',
  'PFC': 'ENERGY',
  'IREDA': 'ENERGY',

  // ENERGY - Coal
  'COALINDIA': 'ENERGY',

  // METAL
  'TATASTEEL': 'METAL',
  'JSWSTEEL': 'METAL',
  'HINDALCO': 'METAL',
  'VEDL': 'METAL',
  'SAIL': 'METAL',
  'JINDALSTEL': 'METAL',
  'NATIONALUM': 'METAL',
  'NMDC': 'METAL',
  'HINDZINC': 'METAL',
  'APLAPOLLO': 'METAL',
  'RATNAMANI': 'METAL',
  'WELCORP': 'METAL',
  'MOIL': 'METAL',

  // INFRA - Construction & Cement
  'ULTRACEMCO': 'INFRA',
  'SHREECEM': 'INFRA',
  'AMBUJACEM': 'INFRA',
  'ACC': 'INFRA',
  'RAMCOCEM': 'INFRA',
  'DALBHARAT': 'INFRA',
  'JKCEMENT': 'INFRA',
  'BIRLACEM': 'INFRA',
  'LT': 'INFRA',
  'ADANIENT': 'INFRA',
  'ADANIPORTS': 'INFRA',
  'GMRINFRA': 'INFRA',
  'IRB': 'INFRA',
  'DLF': 'REALTY',
  'GODREJPROP': 'REALTY',
  'OBEROIRLTY': 'REALTY',
  'PRESTIGE': 'REALTY',
  'BRIGADE': 'REALTY',
  'PHOENIXLTD': 'REALTY',
  'SUNTECK': 'REALTY',
  'SOBHA': 'REALTY',

  // TELECOM
  'BHARTIARTL': 'TELECOM',
  'IDEA': 'TELECOM',
  'TATACOMM': 'TELECOM',
  'INDUSTOWER': 'TELECOM',

  // MEDIA
  'ZEEL': 'MEDIA',
  'SUNTV': 'MEDIA',
  'PVRINOX': 'MEDIA',
  'NETWORK18': 'MEDIA',
  'TV18BRDCST': 'MEDIA',
  'SAREGAMA': 'MEDIA',

  // CONSUMER DURABLES
  'TITAN': 'CONSUMER',
  'HAVELLS': 'CONSUMER',
  'VOLTAS': 'CONSUMER',
  'BLUESTARCO': 'CONSUMER',
  'WHIRLPOOL': 'CONSUMER',
  'CROMPTON': 'CONSUMER',
  'DIXON': 'CONSUMER',
  'VGUARD': 'CONSUMER',
  'RAJESHEXPO': 'CONSUMER',
  'BATAINDIA': 'CONSUMER',
  'RELAXO': 'CONSUMER',
  'PAGEIND': 'CONSUMER',
  'TRENT': 'CONSUMER',
  'ABFRL': 'CONSUMER',
  'RAYMOND': 'CONSUMER',
  'SHOPERSTOP': 'CONSUMER',

  // CHEMICAL
  'PIDILITIND': 'CHEMICAL',
  'ASIANPAINT': 'CHEMICAL',
  'BERGERPAING': 'CHEMICAL',
  'SRF': 'CHEMICAL',
  'ATUL': 'CHEMICAL',
  'NAVINFLUOR': 'CHEMICAL',
  'DEEPAKNTR': 'CHEMICAL',
  'AARTIIND': 'CHEMICAL',
  'FLUOROCHEM': 'CHEMICAL',
  'CLEAN': 'CHEMICAL',
  'PIIND': 'CHEMICAL',
  'UPL': 'CHEMICAL',
  'COROMANDEL': 'CHEMICAL',
  'GNFC': 'CHEMICAL',
  'CHAMBALFERT': 'CHEMICAL',

  // INSURANCE
  'LICI': 'INSURANCE',
  'HDFCLIFE': 'INSURANCE',
  'SBILIFE': 'INSURANCE',
  'ICICIPRULI': 'INSURANCE',
  'ICICIGI': 'INSURANCE',
  'NIACL': 'INSURANCE',
  'GICRE': 'INSURANCE',
  'STARHEALTH': 'INSURANCE'
};

// Sector limits for diversification
const SECTOR_LIMITS = {
  BANKING: parseInt(process.env.SECTOR_LIMIT_BANKING) || 2,
  NBFC: parseInt(process.env.SECTOR_LIMIT_NBFC) || 2,
  IT: parseInt(process.env.SECTOR_LIMIT_IT) || 2,
  PHARMA: parseInt(process.env.SECTOR_LIMIT_PHARMA) || 2,
  AUTO: parseInt(process.env.SECTOR_LIMIT_AUTO) || 2,
  FMCG: parseInt(process.env.SECTOR_LIMIT_FMCG) || 2,
  ENERGY: parseInt(process.env.SECTOR_LIMIT_ENERGY) || 2,
  METAL: parseInt(process.env.SECTOR_LIMIT_METAL) || 2,
  INFRA: parseInt(process.env.SECTOR_LIMIT_INFRA) || 2,
  TELECOM: parseInt(process.env.SECTOR_LIMIT_TELECOM) || 1,
  REALTY: parseInt(process.env.SECTOR_LIMIT_REALTY) || 1,
  MEDIA: parseInt(process.env.SECTOR_LIMIT_MEDIA) || 1,
  CONSUMER: parseInt(process.env.SECTOR_LIMIT_CONSUMER) || 2,
  CHEMICAL: parseInt(process.env.SECTOR_LIMIT_CHEMICAL) || 2,
  INSURANCE: parseInt(process.env.SECTOR_LIMIT_INSURANCE) || 1,
  OTHER: parseInt(process.env.SECTOR_LIMIT_OTHER) || 2
};

/**
 * Get sector for a stock symbol
 * @param {string} symbol - Stock symbol (e.g., 'HDFCBANK')
 * @returns {string} Sector name
 */
function getSector(symbol) {
  // Clean symbol (remove NSE: prefix if present)
  const cleanSymbol = symbol.replace('NSE:', '').toUpperCase();
  return SECTOR_MAPPING[cleanSymbol] || 'OTHER';
}

/**
 * Get limit for a sector
 * @param {string} sector - Sector name
 * @returns {number} Maximum stocks allowed from this sector
 */
function getSectorLimit(sector) {
  return SECTOR_LIMITS[sector] || SECTOR_LIMITS.OTHER;
}

/**
 * Get all sectors
 * @returns {Array} List of all sector names
 */
function getAllSectors() {
  return Object.keys(SECTOR_LIMITS);
}

/**
 * Apply sector diversification to a ranked stock list
 * @param {Array} rankedStocks - Array of {symbol, score, ...} sorted by score
 * @param {number} targetCount - Target number of stocks to select
 * @returns {Array} Diversified stock selection
 */
function applyDiversification(rankedStocks, targetCount = 10) {
  const selected = [];
  const sectorCounts = {};

  for (const stock of rankedStocks) {
    if (selected.length >= targetCount) break;

    const sector = getSector(stock.symbol);
    const limit = getSectorLimit(sector);
    const currentCount = sectorCounts[sector] || 0;

    if (currentCount < limit) {
      selected.push({
        ...stock,
        sector
      });
      sectorCounts[sector] = currentCount + 1;
    }
  }

  return selected;
}

module.exports = {
  SECTOR_MAPPING,
  SECTOR_LIMITS,
  getSector,
  getSectorLimit,
  getAllSectors,
  applyDiversification
};
