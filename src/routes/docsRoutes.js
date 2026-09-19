const express = require('express');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const yaml = require('yamljs');

const router = express.Router();

const specPath = path.join(__dirname, '../../docs/openapi.yaml');
let openapiSpec;

try {
  openapiSpec = yaml.load(specPath);
} catch (err) {
  openapiSpec = { openapi: '3.0.3', info: { title: 'Smart URL Intelligence Platform API', version: '1.0.0' }, paths: {} };
}

// Serve raw YAML and JSON spec
router.get('/docs/openapi.yaml', (req, res) => {
  res.sendFile(specPath);
});

router.get('/docs/openapi.json', (req, res) => {
  res.json(openapiSpec);
});

// Swagger UI route
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec, {
  customSiteTitle: 'Smart URL Intelligence Platform API Docs'
}));

module.exports = router;
