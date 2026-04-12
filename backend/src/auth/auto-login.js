const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const speakeasy = require('speakeasy');
const KiteConnect = require('kiteconnect').KiteConnect;
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

puppeteer.use(StealthPlugin());

class AutoLogin {
  constructor() {
    this.kite = new KiteConnect({ api_key: process.env.ZERODHA_API_KEY });
  }

  _totp() {
    return speakeasy.totp({ secret: process.env.ZERODHA_TOTP_SECRET, encoding: 'base32' });
  }

  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async login() {
    let browser;
    const t0 = Date.now();
    let requestToken = null;

    try {
      logger.info('Auto-login: starting Puppeteer...');

      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      page.on('request', req => {
        const url = req.url();
        if (url.includes('request_token=')) {
          try {
            requestToken = new URL(url).searchParams.get('request_token');
            logger.info('Request token captured');
          } catch (e) {}
        }
      });

      await page.goto(this.kite.getLoginURL(), { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('#userid', { timeout: 15000 });

      await page.type('#userid',   process.env.ZERODHA_USER_ID,   { delay: 100 });
      await page.type('#password', process.env.ZERODHA_PASSWORD,  { delay: 100 });
      await page.click('button[type="submit"]');
      await this._sleep(5000);

      // Check TOTP page
      const onTotp = await page.evaluate(() => {
        const label = document.querySelector('label[for="userid"]');
        return label && label.textContent.includes('TOTP');
      }).catch(() => false);

      if (!onTotp) throw new Error('Did not reach TOTP page');

      await page.waitForSelector('input[type="number"]', { timeout: 10000 });
      await this._sleep(1000);

      const totp = this._totp();
      logger.info(`Entering TOTP...`);

      await page.evaluate(code => {
        const input = document.querySelector('input[type="number"]');
        if (input) {
          input.value = code;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, totp).catch(() => {});

      await this._sleep(500);
      await page.click('button[type="submit"]').catch(() => {});
      await this._sleep(10000);

      if (!requestToken) throw new Error('Request token not captured');

      const session = await this.kite.generateSession(requestToken, process.env.ZERODHA_API_SECRET);
      const accessToken = session.access_token;
      const duration = ((Date.now() - t0) / 1000).toFixed(2);

      await this._saveToken(accessToken);
      logger.info(`Auto-login succeeded in ${duration}s`);
      return { success: true, accessToken, duration };

    } catch (err) {
      logger.error('Auto-login failed:', err.message);
      return { success: false, error: err.message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  async _saveToken(token) {
    const envPath = path.join(__dirname, '../../../.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (content.includes('ZERODHA_ACCESS_TOKEN=')) {
        content = content.replace(/ZERODHA_ACCESS_TOKEN=.*/, `ZERODHA_ACCESS_TOKEN=${token}`);
      } else {
        content += `\nZERODHA_ACCESS_TOKEN=${token}`;
      }
      fs.writeFileSync(envPath, content);
    }
    process.env.ZERODHA_ACCESS_TOKEN = token;
    logger.info('Access token saved');
  }
}

module.exports = AutoLogin;
