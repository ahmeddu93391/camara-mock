const router = require('express').Router();
const axios  = require('axios');

const NRF    = 'http://10.100.200.4:8000';
const UDM    = 'http://10.100.200.8:8000';
const AMF    = 'http://10.100.200.16:8000';
const AF_ID  = '06738def-a5b1-4948-a1aa-93650d8ddf82';
const NEF_ID = '9dea0e89-3b26-4b74-9159-5a01ffce1127';

async function getNRFToken(nfType, targetNfType, scope, instanceId) {
  const r = await axios.post(
    `${NRF}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      nfInstanceId: instanceId,
      nfType, targetNfType, scope,
      requesterPlmn: '{"mcc":"208","mnc":"93"}'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

async function getSupiFromPhone(phone) {
  const msisdn = `msisdn-${phone.replace(/\D/g, '').slice(-10)}`;
  const token  = await getNRFToken('NEF', 'UDM', 'nudm-sdm', NEF_ID);
  const r = await axios.get(
    `${UDM}/nudm-sdm/v2/${msisdn}/id-translation-result`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return r.data.supi;
}

router.post('/v1/retrieve', async (req, res) => {
  const phoneNumber = req.body.device?.phoneNumber;
  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device.phoneNumber requis' });

  try {
    //Convertir numéro → SUPI via UDM
    const supi = await getSupiFromPhone(phoneNumber);

    //Vérifier connexion via AMF
    const tokenAMF = await getNRFToken('AF', 'AMF', 'namf-oam', AF_ID);
    const amfData  = await axios.get(
      `${AMF}/namf-oam/v1/registered-ue-context`,
      { headers: { Authorization: `Bearer ${tokenAMF}` } }
    );

    const ueList    = amfData.data || [];
    const ue        = Array.isArray(ueList)
      ? ueList.find(u => u.Supi === supi || u.supi === supi)
      : null;
    const connected = ue && ue.CmState === 'CONNECTED';

    res.json({
      reachabilityStatus: connected ? 'REACHABLE' : 'UNREACHABLE',
      source: 'free5gc-amf',
      supi,
      cmState: ue ? ue.CmState : 'NOT_FOUND',
      checkedAt: new Date().toISOString()
    });

  } catch(e) {
    console.error('[Device Status v1] Erreur :', e.response ? e.response.data : e.message);
    res.json({ reachabilityStatus: 'UNREACHABLE', source: 'free5gc-amf', checkedAt: new Date().toISOString() });
  }
});

module.exports = router;
