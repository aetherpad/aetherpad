
// placeholder for GAE sessions library.

var _SESSION_ATTR = "sessionDataRoot";

function getSession(opts) {
  opts = opts || {};
  var httpSession = request.session(true);
  if (! httpSession.getAttribute(_SESSION_ATTR)) {
    httpSession.setAttribute(_SESSION_ATTR, {});
  }
  var sessionRoot = httpSession.getAttribute(_SESSION_ATTR);
  var domainKey = (opts.domain ? opts.domain : "");
  var dataKey = [domainKey, httpSession.getId()].join("$");
  if (! sessionRoot[dataKey]) {
    sessionRoot[dataKey] = {};
  }
  return sessionRoot[dataKey];
}

