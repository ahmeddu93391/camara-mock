const router = require('express').Router();
const axios  = require('axios');

const NRF    = 'http://10.100.200.4:8000';
const UDR    = 'http://10.100.200.12:8000';
const NEF_ID = '9dea0e89-3b26-4b74-9159-5a01ffce1127';

async function getNRFToken() {
  const r = await axios.post(
    `${NRF}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      nfInstanceId: NEF_ID,
      nfType: 'NEF',
      targetNfType: 'UDR',
      scope: 'nudr-dr',
      requesterPlmn: '{"mcc":"208","mnc":"93"}'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

function phoneToSupi(phone) {
  const digits = phone.replace(/\D/g, '').slice(-9);
  return `imsi-20893${digits.padStart(10, '0')}`;
}

router.post('/v1/check', async (req, res) => {
  const { phoneNumber, maxAge = 24 } = req.body;

  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'phoneNumber requis' });
  if (maxAge > 240)
    return res.status(400).json({ status: 400, code: 'OUT_OF_RANGE', message: 'maxAge max 240h' });

  try {
    const supi  = phoneToSupi(phoneNumber);
    const token = await getNRFToken();

    const r = await axios.get(
      `${UDR}/nudr-dr/v2/subscription-data/${supi}/authentication-data/authentication-subscription`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const updatedAt = r.data?.updatedAt;
    const swapped = updatedAt
      ? (Date.now() - new Date(updatedAt).getTime()) < maxAge * 3600 * 1000
      : false;

    res.json({ swapped, source: 'free5gc-udr', supi, checkedAt: new Date().toISOString() });

  } catch(e) {
    console.error('[SIM Swap] Erreur UDR :', e.response ? e.response.data : e.message);
    res.json({ swapped: false, source: 'free5gc-udr', checkedAt: new Date().toISOString() });
  }
});

module.exports = router;
