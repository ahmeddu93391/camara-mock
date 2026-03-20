const axios = require('axios');
const WEBUI = 'http://localhost:5000';

async function main() {
  // Login
  const login = await axios.post(`${WEBUI}/api/login`, {
    username: 'admin',
    password: 'free5gc'
  });
  const token = login.data.access_token;
  console.log('Connecté au WebUI');

  // Créer l'abonné
  await axios.post(
    `${WEBUI}/api/subscriber/imsi-208930000000001/20893`,
    {
      plmnID: '20893',
      ueId: 'imsi-208930000000001',
      AuthenticationSubscription: {
        authenticationMethod: '5G_AKA',
        permanentKey: {
          permanentKeyValue: '8baf473f2f8fd09487cccbd7097c6862',
          encryptionKey: 0,
          encryptionAlgorithm: 0
        },
        sequenceNumber: '16f3b3f70fc2',
        authenticationManagementField: '8000',
        opc: {
          opcValue: '8e27b6af0e692e750f32667a3b14605d',
          encryptionKey: 0,
          encryptionAlgorithm: 0
        }
      },
      AccessAndMobilitySubscriptionData: {
        gpsis: ['msisdn-0900000000'],
        subscribedUeAmbr: {
          uplink: '1 Gbps',
          downlink: '2 Gbps'
        },
        nssai: {
          defaultSingleNssais: [{ sst: 1, sd: '010203' }]
        }
      }
    },
    { headers: { Token: token } }
  );

  console.log('Abonné créé : imsi-208930000000001');
  console.log('Numéro associé : msisdn-0900000000');
}

main().catch(e => {
  console.error('Erreur :', e.response ? JSON.stringify(e.response.data) : e.message);
});
