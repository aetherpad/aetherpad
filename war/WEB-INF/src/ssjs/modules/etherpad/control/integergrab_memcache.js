import("gae.channel");
import("gae.dsobj");
import("etherpad.log");
import("etherpad.utils");
import("fastJSON");
import("stringutils.startsWith");
import("gae.taskqueue");
import("gae.memcache");

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
  memcache.clearAll();
  dsobj.deleteRows(TABLE_CLAIMS, {});
  dsobj.deleteRows(TABLE_CONNECTIONS, {});
}

var TABLE_CLAIMS = "INTEGERGRAB_MEMCACHE_CLAIMS";
var TABLE_CONNECTIONS = "CHANNELTEST_CONNECTIONS";
var KEY_NEXTNUM = "integergrab_memcache.nextNum";
var KEY_CLAIM_PREFIX = "integergrab_memcache.claim.";

function newUser(appKey) {
  dsobj.insert(TABLE_CONNECTIONS, {appKey: appKey});
}

function handleComet(op, appKey, data) {
  if (startsWith(data, "join:")) {
    newUser(appKey);
  } else if (startsWith(data, "grab:")) {
    var username = data.substr("grab:".length);

    var origNextNum = Number(memcache.get(KEY_NEXTNUM) || 0);
    var nextNum = origNextNum;
    while (! memcache.putOnlyIfNotPresent(
      KEY_CLAIM_PREFIX+nextNum, username)) {

      nextNum++;
    }
    // nextNum is number that succeeded
    memcache.increment(KEY_NEXTNUM, nextNum-origNextNum+1, 0);

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

  var allConnections = dsobj.selectMulti(TABLE_CONNECTIONS, {});

  var json = fastJSON.stringify(msg);

  allConnections.forEach(function(conn) {
    try {
      channel.sendMessage(conn.appKey, json);
    } catch (e) {
      if (e instanceof java.com.google.appengine.api.channel.ChannelFailureException) {
        //invalidConnections.push(allConnections[i]);
      }
    }
  });
}
