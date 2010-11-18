import("fastJSON");

jimport("com.google.appengine.api.channel.ChannelServiceFactory");
jimport("com.google.appengine.api.channel.ChannelMessage");

var channelService = ChannelServiceFactory.getChannelService();

/**
 * Generates a new token for the given application key.
 */
function createChannel(appKey) {
  return channelService.createChannel(appKey);
}

/**
 * Sends a message to the client identified by the given token.
 */
function sendMessage(appKey, message) {
  var wrappedMessage = fastJSON.stringify({type: "msg", msg: message});
  channelService.sendMessage(new ChannelMessage(appKey, wrappedMessage));
}

jimport("com.google.appengine.api.channel.ChannelServicePb");
jimport("com.google.apphosting.api.ApiProxy");

/**
 * Sends the same message to the clients identified by the given app keys.
 * Returns an array of exceptions thrown by each key, if any.
 */
function sendMessageBatch(appKeyArray, message) {
  var futures = appKeyArray.map(function(appKey) {
    var wrappedMessage = fastJSON.stringify({type: "msg", msg: message});
    var smr = (new ChannelServicePb.SendMessageRequest())
      .setApplicationKey(appKey).setMessage(wrappedMessage);

    var future = ApiProxy.makeAsyncCall(
      "channel", "SendChannelMessage", smr.toByteArray());
    return future;
  });
  var results = futures.map(function(future) {
    try {
      future.get();
      return false;
    } catch (e) {
      return e;
    }
  });
  return results;
}

/**
 * Asks the client to close the connection with an optional message.
 */
function sendDisconnect(appKey, message) {
  var wrappedMessage = fastJSON.stringify({type: "disconnect", msg: message});
  channelService.sendMessage(new ChannelMessage(appKey, wrappedMessage));
}