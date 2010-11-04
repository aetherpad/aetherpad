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
