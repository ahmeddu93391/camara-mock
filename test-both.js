const axios = require('axios');
const BASE  = 'http://localhost:3000';
const PHONE = '0900000000';

async function main() {
  const r = await axios.post(`${BASE}/oauth/token`,
    'grant_type=client_credentials&client_id=test&client_secret=test',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const headers = { Authorization: `Bearer ${r.data.access_token}`, 'Content-Type': 'application/json' };

  console.log('\n=== SIM Swap v0 (WebUI) ===');
  const s0 = await axios.post(`${BASE}/sim-swap/v0/check`, { phoneNumber: PHONE, maxAge: 24 }, { headers });
  console.log(s0.data);

  console.log('\n=== SIM Swap v1 (APIs internes) ===');
  const s1 = await axios.post(`${BASE}/sim-swap/v1/check`, { phoneNumber: PHONE, maxAge: 24 }, { headers });
  console.log(s1.data);

  console.log('\n=== Device Status v0 (WebUI) ===');
  const d0 = await axios.post(`${BASE}/device-reachability-status/v0/retrieve`, { device: { phoneNumber: PHONE } }, { headers });
  console.log(d0.data);

  console.log('\n=== Device Status v1 (APIs internes) ===');
  const d1 = await axios.post(`${BASE}/device-reachability-status/v1/retrieve`, { device: { phoneNumber: PHONE } }, { headers });
  console.log(d1.data);
}

main().catch(e => console.error('Erreur :', e.response ? e.response.data : e.message));
