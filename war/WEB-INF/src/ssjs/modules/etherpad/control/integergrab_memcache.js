import("gae.channel");
import("gae.dsobj");
import("etherpad.log");
import("etherpad.utils");
import("fastJSON");
import("stringutils.startsWith");
import("gae.taskqueue");
import("gae.memcache");
import("jsutils.keys");

function getClaimText(claim) {
  return claim.num+": "+claim.username;
}

function render_test() {
  var claims =
    dsobj.selectMulti(TABLE_CLAIMS, {}, {orderBy: "-num", limit: 10}).map(function(claim) {
      return { text: getClaimText(claim) };
    });

  var html = utils.renderTemplateAsString("misc/integergrab.ejs", { claims: fastJSON.stringify({ a: claims.reverse()}) });
  response.write(html);
}

function render_cleardb() {
  memcache.CLEAR_ALL(); // Clears all data in memcache, not just integer grab!
  dsobj.deleteRows(TABLE_CLAIMS, {});
}

var TABLE_CLAIMS = "INTEGERGRAB_MEMCACHE_CLAIMS";
var KEY_NEXTNUM = "nextNum";
var KEY_CLAIM_PREFIX = "claim.";
var KEY_CONNECTIONS = "connections";

function _getObj(key) {
  var value = _memcache().get(key);
  if (value === null) {
    return null;
  }
  else {
    return fastJSON.parse(value).x;
  }
}
function _performAtomicObj(key, func, initialValue) {
  _memcache().performAtomic(key, function(json) {
    return fastJSON.stringify({x: func(fastJSON.parse(json).x)});
  }, fastJSON.stringify({x:initialValue}));
}

function newUser(appKey) {
  _performAtomicObj(KEY_CONNECTIONS, function(conns) {
    conns[appKey] = true;
    return conns;
  }, {});
}

function _memcache() {
  return memcache.ns("integergrab_memcache");
}

function handleComet(op, appKey, data) {
  var mc = _memcache();

  if (startsWith(data, "join:")) {
    newUser(appKey);
  } else if (startsWith(data, "grab:")) {
    var username = data.substr("grab:".length);

    var origNextNum = Number(mc.get(KEY_NEXTNUM) || 0);
    var nextNum = origNextNum;
    while (! mc.putOnlyIfNotPresent(
      KEY_CLAIM_PREFIX+nextNum, username)) {

      nextNum++;
    }
    // nextNum is number that succeeded
    mc.increment(KEY_NEXTNUM, nextNum-origNextNum+1, 0);

    dsobj.insert(TABLE_CLAIMS, {username: username,
				num: nextNum});

    taskqueue.schedule("integergrab-memcache-notifier",
		       "update-"+nextNum+"-"+
		       String(Math.random()).substr(2),
		      {num:nextNum});
  }
}

function runTask(taskName, args) {
  var numToSend = args.num;

  var claim = dsobj.selectSingle(TABLE_CLAIMS, {num:numToSend});
  var msg =
    {type:"claim", text: getClaimText(claim)};

  var allConnections = keys(_getObj(KEY_CONNECTIONS));

  var json = fastJSON.stringify(msg);

  channel.sendMessageBatch(allConnections, json);
}
