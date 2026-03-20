const router = require('express').Router();

router.post('/v3/verify', (req, res) => {
  const { device, area } = req.body;
  if (!device?.phoneNumber || !area)
    return res.status(400).json({ status: 400, code: 'INVALID_ARGUMENT', message: 'device et area requis' });
  res.status(422).json({
    status: 422,
    code: 'LOCATION_VERIFICATION.UNABLE_TO_LOCATE',
    message: 'Localisation non disponible via free5GC sandbox'
  });
});

module.exports = router;
