const axios = require('axios');
const NRF = 'http://10.100.200.4:8000';
const UDM = 'http://10.100.200.8:8000';
const AMF = 'http://10.100.200.16:8000';
const UDR = 'http://10.100.200.12:8000';

async function getToken(nfType, targetNfType, scope, nfInstanceId) {
  const r = await axios.post(
    `${NRF}/oauth2/token`,
    new URLSearchParams({
      grant_type: 'client_credentials',
      nfInstanceId,
      nfType,
      targetNfType,
      scope,
      requesterPlmn: '{"mcc":"208","mnc":"93"}'
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

async function main() {
  const NEF_ID = '9dea0e89-3b26-4b74-9159-5a01ffce1127';
  const AF_ID  = '06738def-a5b1-4948-a1aa-93650d8ddf82';

  // Test 1 — Appeler l'UDM pour les données d'un abonné
  console.log('\n=== Test UDM ===');
  try {
    const tokenUDM = await getToken('NEF', 'UDM', 'nudm-sdm', NEF_ID);
    const r = await axios.get(
      `${UDM}/nudm-sdm/v1/imsi-208930000000001/nssai`,
      { headers: { Authorization: `Bearer ${tokenUDM}` } }
    );
    console.log('UDM répond :', r.data);
  } catch(e) {
    console.log('UDM erreur :', e.response ? e.response.data : e.message);
  }

  // Test 2 — Appeler l'UDR pour l'historique SIM
  console.log('\n=== Test UDR ===');
  try {
    const tokenUDR = await getToken('NEF', 'UDR', 'nudr-dr', NEF_ID);
    const r = await axios.get(
      `${UDR}/nudr-dr/v1/subscription-data/imsi-208930000000001/authentication-data`,
      { headers: { Authorization: `Bearer ${tokenUDR}` } }
    );
    console.log('UDR répond :', r.data);
  } catch(e) {
    console.log('UDR erreur :', e.response ? e.response.data : e.message);
  }
// Test 3 — Appeler l'AMF pour le statut terminal
  console.log('\n=== Test AMF ===');
  try {
    const tokenAMF = await getToken('AF', 'AMF', 'namf-comm', AF_ID);
    const r = await axios.get(
      `${AMF}/namf-comm/v1/ue-contexts/imsi-208930000000001`,
      { headers: { Authorization: `Bearer ${tokenAMF}` } }
    );
    console.log('AMF répond :', r.data);
  } catch(e) {
    console.log('AMF erreur :', e.response ? e.response.data : e.message);
  }
}

main().catch(e => console.error('Erreur globale :', e.message));
  
