const axios = require('axios');

const WEBUI = 'http://localhost:5000';

async function main() {
  // 1. Login
  console.log('Connexion au WebUI free5GC...');
  const login = await axios.post(`${WEBUI}/api/login`, {
    username: 'admin',
    password: 'free5gc'
  });

  const token = login.data.access_token;
  console.log('Token OK :', token.substring(0, 30) + '...');

  // 2. Lister les abonnés
  console.log('\nRécupération des abonnés...');
  const subscribers = await axios.get(`${WEBUI}/api/subscriber`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  console.log('Abonnés trouvés :', JSON.stringify(subscribers.data, null, 2));
}

main().catch(err => {
  console.error('Erreur :', err.response?.data || err.message);
});
