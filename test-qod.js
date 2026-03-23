const axios = require('axios');

const BASE = 'http://localhost:3000'; // CAMARA
const TERMINAUX = [
  "0900000001",
  "0900000002",
  "0900000003",
  "0900000004",
  "0900000005",
];

async function obtenirTokenCamara() {
  const r = await axios.post(`${BASE}/oauth/token`,
    'grant_type=client_credentials&client_id=test&client_secret=test',
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );
  return r.data.access_token;
}

async function obtenirProfil(numero, token) {
  const res = await axios.get(`${BASE}/v1/profiles/${numero}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  // renvoie { phoneNumber, supi, 5qi, profil }
  return res.data;
}

async function creerSessionQos(numero, profil, token, duree = 3600) {
  const res = await axios.post(`${BASE}/quality-on-demand/v1/sessions`,
    { device: { phoneNumber: numero }, qosProfile: profil, duration: duree },
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );
  return res.data;
}

async function verifierSession(sessionId, token) {
  const res = await axios.get(`${BASE}/quality-on-demand/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
}

async function supprimerSession(sessionId, token) {
  const res = await axios.delete(`${BASE}/quality-on-demand/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.status;
}

async function executerUC1(numero) {
  console.log("\n" + "=".repeat(60));
  console.log(`UC1 - Boost de Connectivité Intelligent\nTerminal : ${numero}`);
  console.log("=".repeat(60));

  const debut = Date.now();
  const token = await obtenirTokenCamara();

  let profil;
  try {
    profil = await obtenirProfil(numero, token);
    console.log(`[1] Profil CAMARA : 5QI=${profil['5qi']} | Profil QoS=${profil['profil']} | SUPI=${profil['supi']}`);
  } catch (e) {
    console.log(`[Erreur] Impossible de récupérer le profil CAMARA pour ${numero}, utilisation par défaut`);
    profil = { '5qi': 9, 'profil': 'QOS_M' };
  }

  let session;
  try {
    session = await creerSessionQos(numero, profil.profil, token);
    console.log(`[2] Session QoS créée : ID=${session.sessionId}, Statut=${session.status}, Expiration=${session.expiresAt}`);
  } catch (e) {
    console.error(`[Erreur] Création session QoS :`, e.response ? e.response.data : e.message);
    return;
  }


  try {
    const verification = await verifierSession(session.sessionId, token);
    console.log(`[3] Session vérifiée :`, verification);
  } catch (e) {
    console.error(`[Erreur] Vérification session :`, e.response ? e.response.data : e.message);
  }

  try {
    const code = await supprimerSession(session.sessionId, token);
    console.log(`[4] Session supprimée : HTTP ${code}`);
  } catch (e) {
    console.error(`[Erreur] Suppression session :`, e.response ? e.response.data : e.message);
  }

  const latence = Date.now() - debut;
  console.log("\n" + "=".repeat(60));
  console.log(`RÉSULTAT FINAL : Décision ACTIVER, Profil QoS=${profil.profil}, Latence=${latence}ms`);
  console.log("=" .repeat(60));
}

(async () => {
  for (const numero of TERMINAUX) {
    await executerUC1(numero);
    await new Promise(r => setTimeout(r, 1000)); // pause 1s
  }
})();
