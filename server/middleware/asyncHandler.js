// Tiny wrapper to forward async-route errors to Express' error handler.
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
