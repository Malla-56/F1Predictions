// router.param handler: validates :round and stores it as an integer on req.round.
module.exports = function parseRound(req, res, next, value) {
  const round = Number(value);
  if (!Number.isInteger(round) || round < 1) {
    return res.status(400).json({ error: 'Invalid round' });
  }
  req.round = round;
  next();
};
