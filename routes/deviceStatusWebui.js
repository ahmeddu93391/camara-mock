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

router.post('/v0/retrieve', async (req, res) => {
  const phoneNumber = req.body.device?.phoneNumber;

  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device.phoneNumber requis' });

  try {
    const token = await getWebuiToken();
    const gpsi  = phoneToGpsi(phoneNumber);

    const subs = await axios.get(`${WEBUI}/api/subscriber`, {
      headers: { Token: token }
    });

    const subscriber = subs.data.find(s => s.gpsi === gpsi);

    res.json({
      reachabilityStatus: subscriber ? 'REACHABLE' : 'UNREACHABLE',
      source: 'webui',
      checkedAt: new Date().toISOString()
    });

  } catch(e) {
    console.error('[Device Status WebUI] Erreur :', e.response ? e.response.data : e.message);
    res.json({ reachabilityStatus: 'UNREACHABLE', source: 'webui', checkedAt: new Date().toISOString() });
  }
});

module.exports = router;
