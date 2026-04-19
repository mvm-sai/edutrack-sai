const express = require('express');
const router  = express.Router();
const QRCode  = require('qrcode');
const auth    = require('../middleware/auth');
const { getWhatsAppStatus } = require('../controllers/whatsappController');
const { getLatestQr } = require('../whatsapp/client');

// GET /api/whatsapp/status  — check if WhatsApp is connected
router.get('/status', auth, getWhatsAppStatus);

// GET /api/whatsapp/qr  — show QR code in browser (no auth, for easy scanning)
router.get('/qr', async (_req, res) => {
  const { isDisabled } = require('../whatsapp/client').getStatus();

  if (isDisabled) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>WhatsApp — Production</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b141a; color: #e9edef; }
        .card { text-align: center; padding: 40px; border-radius: 16px; background: #1f2c33; max-width: 480px; }
        h2 { color: #f59e0b; }
        p { color: #8696a0; line-height: 1.6; }
      </style>
      </head><body>
        <div class="card">
          <h2>⚠️ WhatsApp Unavailable</h2>
          <p>WhatsApp integration is disabled in production cloud environments.</p>
          <p style="font-size:13px; opacity:0.7;">To use WhatsApp features, run the app on a local machine or VPS with a real browser.</p>
        </div>
      </body></html>
    `);
  }

  const qrString = getLatestQr();

  if (!qrString) {
    return res.send(`
      <!DOCTYPE html>
      <html><head><title>WhatsApp QR</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b141a; color: #e9edef; }
        .card { text-align: center; padding: 40px; border-radius: 16px; background: #1f2c33; }
        h2 { color: #25D366; }
        p { color: #8696a0; }
        .btn { display: inline-block; margin-top: 20px; padding: 10px 24px; background: #25D366; color: #111; border-radius: 8px; text-decoration: none; font-weight: 600; }
      </style>
      <meta http-equiv="refresh" content="3">
      </head><body>
        <div class="card">
          <h2>✅ No QR Code Needed</h2>
          <p>WhatsApp is either already connected or still initializing.</p>
          <p style="font-size:13px; opacity:0.6;">This page auto-refreshes every 3 seconds.</p>
          <a class="btn" href="/api/whatsapp/qr">Refresh Now</a>
        </div>
      </body></html>
    `);
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qrString, { width: 400, margin: 2 });
    res.send(`
      <!DOCTYPE html>
      <html><head><title>Scan WhatsApp QR</title>
      <style>
        body { font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #0b141a; color: #e9edef; }
        .card { text-align: center; padding: 40px; border-radius: 16px; background: #1f2c33; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
        h2 { color: #25D366; margin-bottom: 8px; }
        p { color: #8696a0; margin-top: 4px; }
        img { border-radius: 12px; margin: 20px 0; }
        .steps { text-align: left; display: inline-block; color: #8696a0; font-size: 14px; line-height: 1.8; }
        .steps b { color: #e9edef; }
      </style>
      <meta http-equiv="refresh" content="15">
      </head><body>
        <div class="card">
          <h2>📱 Scan QR Code</h2>
          <p>Link your WhatsApp to this app</p>
          <img src="${qrDataUrl}" alt="WhatsApp QR Code" />
          <div class="steps">
            <b>1.</b> Open WhatsApp on your phone<br/>
            <b>2.</b> Tap <b>Settings → Linked Devices</b><br/>
            <b>3.</b> Tap <b>Link a Device</b><br/>
            <b>4.</b> Point your camera at this QR code
          </div>
          <p style="font-size:12px; margin-top:20px; opacity:0.5;">Page auto-refreshes. QR expires periodically.</p>
        </div>
      </body></html>
    `);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR image.' });
  }
});

// GET /api/whatsapp/qr-data  — JSON endpoint for frontend QR modal
router.get('/qr-data', async (_req, res) => {
  const { isReady, hasClient, isInitializing, isDisabled } = require('../whatsapp/client').getStatus();

  if (isDisabled) {
    return res.json({
      status: 'disabled',
      qr: null,
      message: 'WhatsApp is unavailable in production. Use a local or VPS setup for WhatsApp features.',
    });
  }

  const qrString = getLatestQr();

  if (isReady) {
    return res.json({ status: 'connected', qr: null, message: 'WhatsApp is already connected!' });
  }

  if (!qrString) {
    return res.json({
      status: isInitializing ? 'initializing' : 'no_qr',
      qr: null,
      message: isInitializing
        ? 'WhatsApp is initializing, QR will appear shortly...'
        : 'No QR code available. WhatsApp may need to be restarted.',
    });
  }

  try {
    const qrDataUrl = await QRCode.toDataURL(qrString, { width: 400, margin: 2 });
    return res.json({ status: 'qr_ready', qr: qrDataUrl, message: 'Scan this QR code with WhatsApp' });
  } catch (err) {
    return res.status(500).json({ status: 'error', qr: null, message: 'Failed to generate QR image.' });
  }
});

module.exports = router;
