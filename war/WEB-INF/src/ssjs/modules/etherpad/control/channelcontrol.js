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
function render_test() {
  if (USE_DATASTORE) {
    var messages =
      dsobj.selectMulti(tableName, {}, {orderBy: "-date", limit: 10}).map(function(msg) {
	return { date: msg.date, content: msg.content };
      });
  }
  else {
    var messages = [];
  }

  var html = utils.renderTemplateAsString("misc/channeltest.ejs", { messages: fastJSON.stringify({ a: messages.reverse()}) });
  response.write(html);
}

var tableName = "CHANNELTEST_MESSAGES";
var connections = "CHANNELTEST_CONNECTIONS";
var connectionsArray = [];
var USE_DATASTORE = false;

function newUser(appKey) {
  if (USE_DATASTORE) {
    dsobj.insert(connections, {appKey: appKey});
  }
  else {
    connectionsArray.push({appKey: appKey});
  }
}

function handleComet(op, appKey, data) {
  if (startsWith(data, "join:")) {
    newUser(appKey);
  } else if (startsWith(data, "msg:")) {
    var content = data.substr("msg:".length);
    var obj = {type: "msg", content: content, date: +(new Date)};
    if (USE_DATASTORE) {
      dsobj.insert(tableName, obj);

      var allConnections = dsobj.selectMulti(connections, {});
    }
    else {
      var allConnections = connectionsArray;
    }
    var invalidConnections = [];
    var json = fastJSON.stringify(obj);

    for (var i = 0; i < allConnections.length; ++i) {
      try {
        var key = allConnections[i].appKey;
        // if (appKey != key) {
          channel.sendMessage(allConnections[i].appKey, json);
        // } else {
        //   channel.sendMessage(appKey, fastJSON.stringify({type: "msgok", date: obj.date}));
        // }
      } catch (e) {
        if (e instanceof java.com.google.appengine.api.channel.ChannelFailureException) {
          invalidConnections.push(allConnections[i]);
        }
      }
    }
    if (USE_DATASTORE) {
      invalidConnections.forEach(function(obj) { dsobj.deleteRows(connections, obj); });
    }
    else {
      invalidConnections.forEach(function(obj) {
	connectionsArray = connectionsArray.filter(function(obj2) {
	  return obj2.appKey != obj.appKey;
	});
      });
    }
  }
}
