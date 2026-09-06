/**
 * Wraps an async Express route handler so a rejected promise is forwarded to
 * next(err) instead of becoming an unhandled rejection. Use for any handler
 * that doesn't already have its own try/catch:
 *
 *   router.get('/things', asyncHandler(async (req, res) => {
 *     const things = await getThings();
 *     res.json(things);
 *   }));
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
