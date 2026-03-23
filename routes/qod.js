const router  = require('express').Router();
const { v4: uuid } = require('uuid');
const axios   = require('axios');

const NRF    = 'http://10.100.200.4:8000';
const UDM    = 'http://10.100.200.8:8000';
const UDR    = 'http://10.100.200.12:8000';
const NEF_ID = '9dea0e89-3b26-4b74-9159-5a01ffce1127';

const sessions = {};

async function getNRFToken(targetNfType, scope) {
  const r = await axios.post(
    `${NRF}/oauth2/token`,
    new URLSearchParams({
      grant_type:    'client_credentials',
      nfInstanceId:  NEF_ID,
      nfType:        'NEF',
      targetNfType,
      scope,
      requesterPlmn: '{"mcc":"208","mnc":"93"}'
    }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 5000  
    }
  );
  return r.data.access_token;
}

async function getSupiFromPhone(phone) {
  const msisdn = `msisdn-${phone.replace(/\D/g, '').slice(-10)}`;
  const token  = await getNRFToken('UDM', 'nudm-sdm');
  const r = await axios.get(
    `${UDM}/nudm-sdm/v2/${msisdn}/id-translation-result`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000  
    }
  );
  return r.data.supi;
}

router.get('/v1/profiles/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;
  try {
    const supi = await getSupiFromPhone(phoneNumber);
    if (!supi) {
      console.warn(`[QoD Profiles] SUPI introuvable pour ${phoneNumber} → 5QI=9 par défaut`);
      return res.json({ phoneNumber, supi: null, '5qi': 9, source: 'default' });
    }

    const token = await getNRFToken('UDR', 'nudr-dr');
    const r = await axios.get(
      `${UDR}/nudr-dr/v2/subscription-data/${supi}/20893/provisioned-data/sm-data`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 5000  
      }
    );

    const data       = r.data;
    const first      = Array.isArray(data)
      ? (data[0] || {})
      : (data.individualSmSubsData?.[0] || {});
    const dnnConfigs = first.dnnConfigurations || {};
    const internet   = dnnConfigs.internet || {};
    const fiveQI     = internet['5gQosProfile']?.['5qi'] || 9;

    return res.json({ phoneNumber, supi, '5qi': fiveQI, source: 'free5gc' });

  } catch (e) {
    if (e.code === 'ECONNABORTED') {
      console.error(`[QoD Profiles] Timeout NRF/UDM/UDR pour ${phoneNumber}`);
    } else {
      console.error(`[QoD Profiles] Erreur : ${e.message}`);
    }
    return res.json({ phoneNumber, '5qi': 9, source: 'default' });
  }
});

router.post('/v1/sessions', (req, res) => {
  const { device, qosProfile, duration = 3600 } = req.body;
  const phoneNumber = device?.phoneNumber;

  if (!phoneNumber || !qosProfile)
    return res.status(400).json({
      status: 400,
      code: 'INVALID_ARGUMENT',
      message: 'phoneNumber et qosProfile requis'
    });

  const existing = Object.values(sessions).find(
    s => s.phoneNumber === phoneNumber && s.status === 'AVAILABLE'
  );
  if (existing) return res.json(existing);

  const sessionId = uuid();
  sessions[sessionId] = {
    sessionId,
    phoneNumber,
    qosProfile,
    status:    'AVAILABLE',
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + duration * 1000).toISOString(),
  };
  res.status(201).json(sessions[sessionId]);
});

router.post('/v1/sessions/:sessionId/extend', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ status: 404, code: 'NOT_FOUND' });

  const extra = req.body.requestedAdditionalDuration || 3600;
  session.expiresAt = new Date(
    new Date(session.expiresAt).getTime() + extra * 1000
  ).toISOString();
  res.json(session);
});

router.get('/v1/sessions/:sessionId', (req, res) => {
  const session = sessions[req.params.sessionId];
  if (!session) return res.status(404).json({ status: 404, code: 'NOT_FOUND' });
  res.json(session);
});

router.delete('/v1/sessions/:sessionId', (req, res) => {
  if (!sessions[req.params.sessionId])
    return res.status(404).json({ status: 404, code: 'NOT_FOUND' });
  delete sessions[req.params.sessionId];
  res.status(204).send();
});

module.exports = router;
