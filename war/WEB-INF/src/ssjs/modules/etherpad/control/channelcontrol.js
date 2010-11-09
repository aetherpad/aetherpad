import("gae.channel");
import("gae.dsobj");
import("etherpad.log");
import("etherpad.utils");
import("fastJSON");
import("stringutils.startsWith");

function render_newchannel() {
  var appKey = request.params.appKey;
  response.setContentType("application/json");
  response.write(fastJSON.stringify({ token: channel.createChannel(appKey) }));
}

function render_send() {
  var appKey = request.params.appKey;
  var messages = fastJSON.parse(request.params.messages).a;
  messages.forEach(function(msg) {
    // keep all messages from the channelcontrol key local to this module.
    if (startsWith(appKey, "channelcontrol.test-")) {
      handleComet("message", appKey, msg);
      return;
    }
    serverhandlers.cometHandler("message", appKey, msg);
  });
  response.setContentType("application/json");
  response.write(fastJSON.stringify({ status: "ok" }));
}

/**
 * These functions below are all part of the "super happy chat" test,
 * and not part of the channel infrastructure.
 */

function getClaimText(claim) {
  return claim.num+": "+claim.username;
}

function render_test() {
  var claims =
    dsobj.selectMulti(TABLE_CLAIMS, {}, {orderBy: "-num", limit: 10}).map(function(claim) {
      return { text: getClaimText(claim) };
    });

  var html = utils.renderTemplateAsString("misc/channeltest.ejs", { claims: fastJSON.stringify({ a: claims.reverse()}) });
  response.write(html);
}

function render_cleardb() {
  dsobj.deleteRows(TABLE_CLAIMS, {});
  dsobj.deleteRows(TABLE_CONNECTIONS, {});
}

var TABLE_CLAIMS = "CHANNELTEST_CLAIMS";
var TABLE_CONNECTIONS = "CHANNELTEST_CONNECTIONS";

function newUser(appKey) {
  dsobj.insert(TABLE_CONNECTIONS, {appKey: appKey});
}

function handleComet(op, appKey, data) {
  if (startsWith(data, "join:")) {
    newUser(appKey);
  } else if (startsWith(data, "grab:")) {
    var username = data.substr("grab:".length);

    var newClaimNum = Math.round((((+new Date)/20)%10000)+1);
    var newClaim = {num: newClaimNum, username: username};
    dsobj.insert(TABLE_CLAIMS, newClaim);

    var msg = {type: "claim", text: getClaimText(newClaim)};

    var allConnections = dsobj.selectMulti(TABLE_CONNECTIONS, {});

    var json = fastJSON.stringify(msg);

    for (var i = 0; i < allConnections.length; ++i) {
      try {
        channel.sendMessage(allConnections[i].appKey, json);
      } catch (e) {
        if (e instanceof java.com.google.appengine.api.channel.ChannelFailureException) {
          //invalidConnections.push(allConnections[i]);
        }
      }
    }
  }
}
