// Site manager only: settings shared by every league (race lock times, results,
// imports, OpenF1). League-level admin rights are checked by requireLeagueAdmin.
module.exports = function requireSiteManager(req, res, next) {
  if (req.user?.role !== 'site_manager') {
    return res.status(403).json({ error: 'Site manager access required' });
  }
  next();
};
