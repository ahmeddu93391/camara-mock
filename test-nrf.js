const axios = require('axios');
const NRF = 'http://10.100.200.4:8000';

async function test(description, body) {
  try {
    console.log(`\nTest : ${description}`);
    const r = await axios.post(
      `${NRF}/oauth2/token`,
      new URLSearchParams(body),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    console.log('OK :', JSON.stringify(r.data).substring(0, 100));
    return r.data.access_token;
  } catch(e) {
    console.log('Erreur :', e.response ? e.response.data : e.message);
    return null;
  }
}

async function main() {
  // Format exact utilisé par les NFs internes free5GC
  await test('Format NF interne', {
    grant_type: 'client_credentials',
    nfInstanceId: '9dea0e89-3b26-4b74-9159-5a01ffce1127',
    nfType: 'NEF',
    targetNfType: 'UDM',
    scope: 'nudm-sdm nudm-uecm',
    requesterPlmn: '{"mcc":"208","mnc":"93"}'
  });

  // Format AF
  await test('Format AF', {
    grant_type: 'client_credentials',
    nfInstanceId: '06738def-a5b1-4948-a1aa-93650d8ddf82',
    nfType: 'AF',
    targetNfType: 'AMF',
    scope: 'namf-comm',
    requesterPlmn: '{"mcc":"208","mnc":"93"}'
  });
}

main().catch(e => console.error('Erreur :', e.message));
