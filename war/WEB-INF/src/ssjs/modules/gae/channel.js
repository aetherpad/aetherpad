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
  channelService.sendMessage(new ChannelMessage(appKey, message));
}

jimport("com.google.appengine.api.channel.ChannelServicePb");
jimport("com.google.apphosting.api.ApiProxy");

/**
 * Sends the same message to the clients identified by the given app keys.
 * Returns an array of exceptions thrown by each key, if any.
 */
function sendMessageBatch(appKeyArray, message) {
  var futures = appKeyArray.map(function(appKey) {
    var smr = (new ChannelServicePb.SendMessageRequest())
      .setApplicationKey(appKey).setMessage(message);

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