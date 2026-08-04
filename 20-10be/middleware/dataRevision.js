const dataRevisionService = require('../services/dataRevisionService');

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SHARED_DATA_PREFIXES = [
  '/api/students',
  '/api/admin/students',
  '/api/gallery',
  '/api/admin/letters',
  '/api/letters',
  '/api/gifts',
];

function isSharedDataMutation(req) {
  if (!MUTATION_METHODS.has(req.method)) return false;
  const requestPath = req.originalUrl.split('?')[0];
  if (requestPath.endsWith('/react')) return false;
  return SHARED_DATA_PREFIXES.some(
    (prefix) => requestPath === prefix || requestPath.startsWith(`${prefix}/`),
  );
}

function dataRevisionMiddleware(req, res, next) {
  if (!isSharedDataMutation(req)) return next();

  res.once('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    dataRevisionService.bumpRevision().catch((error) => {
      console.error('[dataRevision]', error.message);
    });
  });
  return next();
}

module.exports = dataRevisionMiddleware;
module.exports.isSharedDataMutation = isSharedDataMutation;
