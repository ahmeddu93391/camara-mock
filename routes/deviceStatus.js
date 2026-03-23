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
      grant_type:    'client_credentials',
      nfInstanceId:  instanceId,
      nfType,
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
  const token  = await getNRFToken('NEF', 'UDM', 'nudm-sdm', NEF_ID);
  const r = await axios.get(
    `${UDM}/nudm-sdm/v2/${msisdn}/id-translation-result`,
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000   
    }
  );
  return r.data.supi;
}

router.post('/v1/retrieve', async (req, res) => {
  const phoneNumber = req.body.device?.phoneNumber;
  if (!phoneNumber)
    return res.status(400).json({
      status: 400,
      code:    'INVALID_ARGUMENT',
      message: 'device.phoneNumber requis'
    });

  try {
    const supi = await getSupiFromPhone(phoneNumber);
    if (!supi) {
      console.warn(`[Device Status] SUPI introuvable pour ${phoneNumber} → UNREACHABLE`);
      return res.json({
        reachabilityStatus: 'UNREACHABLE',
        source:             'free5gc-amf',
        supi:               null,
        cmState:            'NOT_FOUND',
        checkedAt:          new Date().toISOString()
      });
    }

    const tokenAMF = await getNRFToken('AF', 'AMF', 'namf-oam', AF_ID);
    const amfData  = await axios.get(
      `${AMF}/namf-oam/v1/registered-ue-context`,
      {
        headers: { Authorization: `Bearer ${tokenAMF}` },
        timeout: 5000  
      }
    );

    const ueList = amfData.data || [];
    const ue     = Array.isArray(ueList)
      ? ueList.find(u => u.Supi === supi || u.supi === supi)
      : null;
    const cmState   = ue?.CmState || ue?.cmState || 'NOT_FOUND';
    const connected = ue && cmState.toUpperCase() === 'CONNECTED';

    return res.json({
      reachabilityStatus: connected ? 'REACHABLE' : 'UNREACHABLE',
      source:             'free5gc-amf',
      supi,
      cmState,
      checkedAt:          new Date().toISOString()
    });

  } catch (e) {
    if (e.code === 'ECONNABORTED') {
      console.error(`[Device Status] Timeout NRF/UDM/AMF pour ${phoneNumber}`);
    } else if (e.response) {
      console.error(`[Device Status] HTTP ${e.response.status} : ${JSON.stringify(e.response.data)}`);
    } else {
      console.error(`[Device Status] Erreur : ${e.message}`);
    }

    return res.json({
      reachabilityStatus: 'UNREACHABLE',
      source:             'free5gc-amf',
      supi:               null,
      cmState:            'ERROR',
      checkedAt:          new Date().toISOString()
    });
  }
});

module.exports = router;
