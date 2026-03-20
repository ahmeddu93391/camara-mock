const router = require('express').Router();
const axios  = require('axios');

const WEBUI = 'http://host.docker.internal:5000';

async function getWebuiToken() {
  const login = await axios.post(`${WEBUI}/api/login`, {
    username: 'admin',
    password: 'free5gc'
  });
  return login.data.access_token;
}

router.post('/v0/retrieve', async (req, res) => {
  const phoneNumber = req.body.device?.phoneNumber;

  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device.phoneNumber requis' });

  try {
    const token = await getWebuiToken();
    const gpsi = phoneToGpsi(phoneNumber);

    // Récupérer tous les abonnés
    const subs = await axios.get(`${WEBUI}/api/subscriber`, {
      headers: { Token: token }
    });

    const subscriber = subs.data.find(s => s.gpsi === gpsi);

    if (!subscriber) {
      return res.json({
        reachabilityStatus: 'UNREACHABLE',
        reason: 'Abonné non trouvé',
        checkedAt: new Date().toISOString()
      });
    }

    // Abonné trouvé = enregistré dans le réseau
    res.json({
      reachabilityStatus: 'REACHABLE',
      ueId: subscriber.ueId,
      checkedAt: new Date().toISOString()
    });

  } catch(e) {
    console.error('[Device Status] Erreur :', e.response ? e.response.data : e.message);
    res.json({ reachabilityStatus: 'UNREACHABLE', checkedAt: new Date().toISOString() });
  }
});

function phoneToGpsi(phone) {
  const digits = phone.replace(/\D/g, '').slice(-10);
  return `msisdn-${digits}`;
}

module.exports = router;
