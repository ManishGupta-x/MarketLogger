const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const speakeasy = require('speakeasy');
const KiteConnect = require('kiteconnect').KiteConnect;
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

class AutoLogin {
  constructor() {
    this.kite = new KiteConnect({
      api_key: process.env.ZERODHA_API_KEY
    });
  }

  generateTOTP() {
    return speakeasy.totp({
      secret: process.env.ZERODHA_TOTP_SECRET,
      encoding: 'base32'
    });
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async login() {
    let browser;
    const startTime = Date.now();
    let requestToken = null;

    try {
      console.log('\n🤖 Starting automated Zerodha login...');

      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });

      // Setup request listener to capture token
      page.on('request', (request) => {
        const url = request.url();
        if (url.includes('request_token=')) {
          console.log('📡 Captured redirect URL:', url);
          try {
            const urlObj = new URL(url);
            requestToken = urlObj.searchParams.get('request_token');
            console.log('✅ Token extracted:', requestToken);
          } catch (e) {
            console.log('⚠️ Error parsing URL:', e.message);
          }
        }
      });

      const loginURL = this.kite.getLoginURL();
      console.log('📍 Opening Zerodha login page...');
      await page.goto(loginURL, { waitUntil: 'domcontentloaded', timeout: 30000 });

      await page.waitForSelector('#userid', { timeout: 15000 });
      console.log('✅ Login page loaded');

      console.log('👤 Entering user ID...');
      await page.type('#userid', process.env.ZERODHA_USER_ID, { delay: 100 });

      console.log('🔒 Entering password...');
      await page.type('#password', process.env.ZERODHA_PASSWORD, { delay: 100 });

      console.log('🖱️ Clicking login button...');
      await page.click('button[type="submit"]');
      
      console.log('⏳ Waiting for TOTP page...');
      await this.sleep(5000);

      // Check if we're on TOTP page
      let onTotpPage = false;
      try {
        onTotpPage = await page.evaluate(() => {
          const label = document.querySelector('label[for="userid"]');
          return label && label.textContent.includes('TOTP');
        });
      } catch (e) {
        console.log('⚠️ Could not check TOTP page:', e.message);
      }

      if (!onTotpPage) {
        throw new Error('Did not reach TOTP page');
      }

      console.log('✅ Found TOTP page');

      await page.waitForSelector('input[type="number"]', { timeout: 10000 });
      await this.sleep(1000);

      const totp = this.generateTOTP();
      console.log(`🔑 Entering 2FA code: ${totp}`);

      // Enter TOTP - this might fail due to navigation, that's OK!
      try {
        await page.evaluate((code) => {
          const input = document.querySelector('input[type="number"]');
          if (input) {
            input.value = code;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, totp);

        await this.sleep(500);

        // Try to verify, but don't fail if page navigates
        try {
          const enteredValue = await page.evaluate(() => {
            const input = document.querySelector('input[type="number"]');
            return input ? input.value : '';
          });
          console.log(`✅ TOTP entered: ${enteredValue}`);
        } catch (e) {
          console.log('⚠️ Could not verify TOTP (page may have navigated)');
        }

      } catch (e) {
        console.log('⚠️ TOTP entry error (continuing anyway):', e.message);
      }

      // Click submit - don't fail if it errors
      console.log('🖱️ Clicking continue...');
      try {
        await page.click('button[type="submit"]');
      } catch (e) {
        console.log('⚠️ Submit click error (continuing):', e.message);
      }

      console.log('⏳ Waiting for token capture (10 seconds)...');
      await this.sleep(10000);

      // Check if token was captured
      if (!requestToken) {
        throw new Error('Request token was not captured');
      }

      console.log('✅ Request token obtained:', requestToken);

      console.log('🔄 Generating access token...');
      const session = await this.kite.generateSession(
        requestToken,
        process.env.ZERODHA_API_SECRET
      );

      const accessToken = session.access_token;
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log(`✅ Access token generated in ${duration}s`);
      console.log('🎉 Token:', accessToken);

      await this.saveToken(accessToken);

      return {
        success: true,
        accessToken: accessToken,
        duration: duration
      };

    } catch (error) {
      console.error('❌ Auto-login failed:', error.message);

      if (browser) {
        try {
          const pages = await browser.pages();
          if (pages.length > 0) {
            const screenshot = await pages[0].screenshot();
            const filename = `error-${Date.now()}.png`;
            fs.writeFileSync(filename, screenshot);
            console.log(`📸 Error screenshot saved: ${filename}`);
          }
        } catch (e) {
          console.error('Could not save screenshot:', e.message);
        }
      }

      return {
        success: false,
        error: error.message
      };

    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async saveToken(token) {
    const envPath = path.join(__dirname, '../../.env');
    
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      
      if (envContent.includes('ZERODHA_ACCESS_TOKEN=')) {
        envContent = envContent.replace(
          /ZERODHA_ACCESS_TOKEN=.*/,
          `ZERODHA_ACCESS_TOKEN=${token}`
        );
      } else {
        envContent += `\nZERODHA_ACCESS_TOKEN=${token}`;
      }
      
      fs.writeFileSync(envPath, envContent);
      console.log('💾 Token saved to .env file');
    }

    process.env.ZERODHA_ACCESS_TOKEN = token;
  }
}

module.exports = AutoLogin;