const router = require('express').Router();
const axios  = require('axios');

const WEBUI = 'http://host.docker.internal:5000';

async function getWebuiToken() {
  const r = await axios.post(`${WEBUI}/api/login`, {
    username: 'admin', password: 'free5gc'
  });
  return r.data.access_token;
}

function phoneToGpsi(phone) {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return `msisdn-${digits}`;
}

router.post('/v0/check', async (req, res) => {
  const { phoneNumber, maxAge = 24 } = req.body;

  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'phoneNumber requis' });
  if (maxAge > 240)
    return res.status(400).json({ status: 400, code: 'OUT_OF_RANGE', message: 'maxAge max 240h' });

  try {
    const token = await getWebuiToken();
    const gpsi  = phoneToGpsi(phoneNumber);

    const subs = await axios.get(`${WEBUI}/api/subscriber`, {
      headers: { Token: token }
    });

    const subscriber = subs.data.find(s => s.gpsi === gpsi);

    if (!subscriber)
      return res.status(404).json({ status: 404, code: 'NOT_FOUND', message: `Abonné ${phoneNumber} non trouvé` });

    const detail = await axios.get(
      `${WEBUI}/api/subscriber/${subscriber.ueId}/${subscriber.plmnID}`,
      { headers: { Token: token } }
    );

    const updatedAt = detail.data.updatedAt || detail.data.createdAt;
    const swapped = updatedAt
      ? (Date.now() - new Date(updatedAt).getTime()) < maxAge * 3600 * 1000
      : false;

    res.json({ swapped, source: 'webui', checkedAt: new Date().toISOString() });

  } catch(e) {
    console.error('[SIM Swap WebUI] Erreur :', e.response ? e.response.data : e.message);
    res.json({ swapped: false, source: 'webui', checkedAt: new Date().toISOString() });
  }
});

module.exports = router;
