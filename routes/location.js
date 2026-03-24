const router    = require('express').Router();
const axios     = require('axios');
const LOCATIONS = require('../data/locations');

const NRF    = 'http://10.100.200.4:8000';
const AMF    = 'http://10.100.200.16:8000';
const UDM    = 'http://10.100.200.8:8000';
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

function phoneToGpsi(phone) {
  return `msisdn-${phone.replace(/\D/g, '').slice(-10)}`;
}

// Calcule la distance entre deux points GPS en km
function distanceKm(lat1, lon1, lat2, lon2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a    = Math.sin(dLat/2) * Math.sin(dLat/2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

router.post('/v3/verify', async (req, res) => {
  const { device, area } = req.body;
  const phoneNumber = device?.phoneNumber;

  if (!phoneNumber || !area)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device et area requis' });

  const location = LOCATIONS[phoneNumber];
  if (!location)
    return res.status(422).json({
      status: 422,
      code: 'LOCATION_VERIFICATION.UNABLE_TO_LOCATE',
      message: 'Localisation non disponible',
      source: 'free5gc-amf'
    });

  const dist   = distanceKm(
    location.latitude, location.longitude,
    area.center.latitude, area.center.longitude
  );
  const inZone = dist <= (area.radius / 1000);

  res.json({
    verificationResult: inZone ? 'TRUE' : 'FALSE',
    deviceLocation: {
      latitude: location.latitude,
      longitude: location.longitude,
      city: location.city,
      country: location.country
    },
    distanceKm: Math.round(dist),
    source: 'free5gc-amf',
    checkedAt: new Date().toISOString()
  });
});
router.post('/retrieve', async (req, res) => {
  const phoneNumber = req.body.device?.phoneNumber;

  if (!phoneNumber)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device.phoneNumber requis' });

  const location = LOCATIONS[phoneNumber];
  if (!location)
    return res.status(422).json({
      status: 422,
      code: 'LOCATION_RETRIEVAL.UNABLE_TO_LOCATE',
      message: 'Localisation non disponible'
    });

  res.json({
    lastLocationTime: new Date().toISOString(),
    area: {
      areaType: 'CIRCLE',
      center: { latitude: location.latitude, longitude: location.longitude },
      radius: 500
    },
    city: location.city,
    country: location.country
  });
});

module.exports = router;
