const router = require('express').Router();
const axios = require('axios');

const { FREE5GC } = require('../index');

const NEF_ID = '9dea0e89-3b26-4b74-9159-5a01ffce1127';

const CORRESPONDANCE_5QI = {
  1: { profil: 'QOS_E', description: 'Voix temps réel' },
  2: { profil: 'QOS_E', description: 'Vidéo temps réel' },
  3: { profil: 'QOS_E', description: 'Jeu temps réel' },
  4: { profil: 'QOS_L', description: 'Jeu en ligne' },
  5: { profil: 'QOS_L', description: 'IMS signalisation' },
  6: { profil: 'QOS_L', description: 'Streaming live' },
  7: { profil: 'QOS_L', description: 'Voix interactive' },
  8: { profil: 'QOS_S', description: 'Téléchargement' },
  9: { profil: 'QOS_M', description: 'Navigation web' },
};

async function getNRFToken(targetNfType, scope) {
  const r = await axios.post(
    `${FREE5GC.nef}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      nfInstanceId: NEF_ID,
      nfType: 'NEF',
      targetNfType,
      scope,
      requesterPlmn: '{"mcc":"208","mnc":"93"}'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

async function getSupiFromPhone(phoneNumber) {
  const msisdn = 'msisdn-' + phoneNumber.replace(/\D/g, '').slice(-10);
  const token = await getNRFToken('UDM', 'nudm-sdm');
  const r = await axios.get(
    `${FREE5GC.udm}/nudm-sdm/v2/${msisdn}/id-translation-result`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return r.data.supi;
}

router.get('/:phoneNumber', async (req, res) => {
  const { phoneNumber } = req.params;
  try {
    const supi = await getSupiFromPhone(phoneNumber);
    const token = await getNRFToken('UDR', 'nudr-dr');

    const r = await axios.get(
      `${FREE5GC.udr}/nudr-dr/v2/subscription-data/${supi}/20893/provisioned-data/sm-data`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    let fiveQI = 9;
    if (r.data && Array.isArray(r.data) && r.data.length > 0) {
      const dnn = r.data[0].dnnConfigurations?.internet?.['5gQosProfile'];
      if (dnn && dnn['5qi']) fiveQI = dnn['5qi'];
    }

    const info = CORRESPONDANCE_5QI[fiveQI] || { profil: 'QOS_M', description: 'Navigation web' };
    res.json({ phoneNumber, supi, fiveQI, profil: info.profil, description: info.description });

  } catch (e) {
    console.error('[Profiles] Erreur :', e.message);
    res.json({ phoneNumber, fiveQI: 9, profil: 'QOS_M', description: 'Navigation web (défaut)' });
  }
});

module.exports = router;
