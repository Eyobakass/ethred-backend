const express = require('express');
const router = express.Router();
const controller = require('./controller');
const authenticate = require('../../middleware/authenticate');

router.use(authenticate);

// Toggle favorite
router.post('/:propertyId', controller.addFavorite);
router.delete('/:propertyId', controller.removeFavorite);

// List buyer's favorites (SRS REQ-BUY-01)
router.get('/', controller.listFavorites);

module.exports = router;
