const axios = require('axios');
const fs = require('fs');
const https = require('https');
const path = require('path');

const NRF_URL = 'http://10.100.200.4:8000';
const CERT_PATH = '/opt/camara/cert';

function getHttpsAgent() {
  try {
    return new https.Agent({
      cert: fs.readFileSync(path.join(CERT_PATH, 'nef.pem')),
      key:  fs.readFileSync(path.join(CERT_PATH, 'nef.key')),
      ca:   fs.readFileSync(path.join(CERT_PATH, 'root.pem')),
      rejectUnauthorized: false
    });
  } catch {
    return new https.Agent({ rejectUnauthorized: false });
  }
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getNRFToken(targetNF = 'nudm-sdm') {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;

  const response = await axios.post(
    `${NRF_URL}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      nfType: 'NEF',
      targetNfType: targetNF.split('-')[0].toUpperCase(),
      scope: targetNF
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      httpsAgent: getHttpsAgent()
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiresAt = Date.now() + (response.data.expires_in - 30) * 1000;
  return cachedToken;
}

module.exports = { getNRFToken };
