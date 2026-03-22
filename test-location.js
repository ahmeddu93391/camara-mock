const axios = require('axios');
const BASE = 'http://localhost:3000';

async function main() {
  const r = await axios.post(`${BASE}/oauth/token`,
    'grant_type=client_credentials&client_id=test&client_secret=test',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  const headers = { Authorization: `Bearer ${r.data.access_token}`, 'Content-Type': 'application/json' };

  const body = {
    device: { phoneNumber: '0900000000' },
    area: {
      areaType: 'CIRCLE',
      center: { latitude: 48.8566, longitude: 2.3522 },
      radius: 1000
    }
  };

  // WebUI
  const res0 = await axios.post(`${BASE}/webui/location-verification/v0/verify`,
    body, { headers }
  ).catch(e => e.response);
  console.log('Location WebUI :', res0.data);

  // APIs internes
  const res1 = await axios.post(`${BASE}/location-verification/v3/verify`,
    body, { headers }
  ).catch(e => e.response);
  console.log('Location APIs internes :', res1.data);
}

main().catch(e => console.error('Erreur :', e.response ? e.response.data : e.message));
