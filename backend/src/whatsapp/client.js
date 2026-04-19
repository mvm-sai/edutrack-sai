const path    = require('path');
const qrcode  = require('qrcode-terminal');

// ─── Production detection ─────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === 'production';

let whatsappClient = null;
let isReady        = false;
let isInitializing = false;
let isDisabled     = false;   // true when running in production (cloud)
let latestQr       = null;

/**
 * Boot the WhatsApp Web client.
 * Prints a QR code to the terminal on first run.
 * Session is cached in .wwebjs_auth/ so future starts skip QR.
 *
 * In production (cloud) environments, WhatsApp is disabled because
 * whatsapp-web.js requires a real Chromium browser with persistent storage.
 */
const initWhatsApp = () => {
  if (isProduction) {
    isDisabled = true;
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║   📱  WhatsApp integration DISABLED in production        ║');
    console.log('║   Cloud environments don\'t support whatsapp-web.js.      ║');
    console.log('║   Use a VPS or local machine for WhatsApp features.      ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('');
    return;
  }

  if (isInitializing || whatsappClient) return;
  isInitializing = true;

  // Dynamic require so production deploys don't fail if puppeteer is missing
  const { Client, LocalAuth } = require('whatsapp-web.js');

  const client = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(process.cwd(), '.wwebjs_auth'),
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
      ],
    },
  });

  // ── Events ──────────────────────────────────────────────────────────────────
  client.on('qr', (qr) => {
    latestQr = qr;
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════╗');
    console.log('║        📱  SCAN THIS QR CODE WITH WHATSAPP  📱           ║');
    console.log('║   Open WhatsApp → Settings → Linked Devices → Link       ║');
    console.log('║   Or visit: http://localhost:3001/api/whatsapp/qr        ║');
    console.log('╚══════════════════════════════════════════════════════════╝');
    console.log('\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for QR scan...\n');
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`⏳ WhatsApp loading: ${percent}% — ${message}`);
  });

  client.on('authenticated', () => {
    latestQr = null;
    console.log('🔐 WhatsApp authenticated! Loading session...');
  });

  client.on('ready', () => {
    isReady = true;
    latestQr = null;
    console.log('✅ WhatsApp client is ready — messages will be sent automatically!');
  });

  client.on('auth_failure', (msg) => {
    isReady = false;
    console.error('❌ WhatsApp auth failure:', msg);
    console.log('🔄 Retrying in 30 seconds...');
    setTimeout(() => {
      whatsappClient = null;
      isInitializing = false;
      initWhatsApp();
    }, 30_000);
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    console.warn('⚠️  WhatsApp disconnected:', reason);
    console.log('🔄 Reconnecting in 10 seconds...');
    whatsappClient = null;
    isInitializing = false;
    setTimeout(initWhatsApp, 10_000);
  });

  client.initialize().catch((err) => {
    console.error('❌ WhatsApp init error:', err.message);
    whatsappClient = null;
    isInitializing = false;
  });

  whatsappClient = client;
};

/**
 * Send a WhatsApp message to a phone number.
 * @param {string} phone  - Number with country code, e.g. "919876543210"
 * @param {string} message - Message text
 */
const sendMessage = async (phone, message) => {
  if (isDisabled) {
    throw new Error('WhatsApp is disabled in production. Use a local or VPS setup for WhatsApp features.');
  }

  if (!whatsappClient || !isReady) {
    throw new Error('WhatsApp client not ready. Please scan the QR code in the terminal first.');
  }

  // Use getNumberId() to resolve the correct chat ID and avoid "No LID for user" errors
  const numberId = await whatsappClient.getNumberId(phone);
  if (!numberId) {
    throw new Error(`Phone number ${phone} is not registered on WhatsApp.`);
  }

  const chatId = numberId._serialized;
  await whatsappClient.sendMessage(chatId, message);
};

/**
 * Get current WhatsApp connection status.
 */
const getStatus = () => ({
  isReady,
  hasClient:    !!whatsappClient,
  isInitializing,
  isDisabled,
});

const getLatestQr = () => latestQr;

module.exports = { initWhatsApp, sendMessage, getStatus, getLatestQr };
