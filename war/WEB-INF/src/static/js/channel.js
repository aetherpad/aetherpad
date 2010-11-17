/* Depends on /_ah/channel/jsapi, jQuery, and json2. */

/**
 * Creates a new WebSocket with the given application key and token.
 * If "token" is not provided, WebSocket performs an extra round-trip
 * to the server to create one.
 */
function WebSocket(appKey, token) {
  var self = this;

  var channel;
  var socket;

  var CLOSED = 0;
  var PENDING = 1;
  var OPEN = 2;

  var state = CLOSED;

  function makeChannel(cb) {
    if (channel) {
      cb();
    } else if (token) {
      channel = new goog.appengine.Channel(token);
      cb();
    } else {
      $.ajax({
        type: "POST",
        url: "/ep/channel/newchannel",
        data: { appKey: appKey },
        dataType: "json",
        success: function(data) {
          token = data.token;
          channel = new goog.appengine.Channel(token);
          cb();
        },
        error: function(xhr, textStatus, error) {
          self.onerror({ description: textStatus, code: xhr.status, error: error });
        }
      });
    }
  }

  // renamed to make change fail-fast - semantics have changed.
  this.open = function() {
    if (state != CLOSED) {
      return;
    }
    state = PENDING;
    queue = [];
    isSending = false;

    makeChannel(function() {
      var handler = {};//HACK new goog.appengine.Socket.Handler();
      handler.onopen = function() { handleOpen(); }
      handler.onmessage = function(evt) { self.onmessage(evt); }
      handler.onerror = function(error) { handleError(error); }
      handler.onclose = function() { handleClose(); }

      socket = channel.open(/*handler*/);
      // HACK (handlers not working in prod) -- dgreenspan
      socket.onopen = handler.onopen;
      socket.onmessage = handler.onmessage;
      socket.onerror = handler.onerror;
      socket.onclose = handler.onclose;
    });
  }

  function handleOpen() {
    state = OPEN;
    self.onopen();
  }
  this.onopen = function() { }
  this.onmessage = function(evt) { }
  function handleError(error) {
    state = CLOSED;
    self.onerror(error);
  }
  this.onerror = function(error) { }
  function handleClose() {
    state = CLOSED;
    self.onclose();
  }
  this.onclose = function() { }

  this.close = function() {
    if (socket) {
      socket.close();
      socket = undefined;
      state = CLOSED;
    }
  }

  var queue = [];
  var isSending = false;

  function doSendPost() {
    if (state == OPEN && !isSending && queue.length > 0) {
      $.ajax({
        type: "POST",
        url: "/ep/channel/send",
        data: {appKey: appKey, token: token, messages: JSON.stringify({ a: queue })},
        dataType: "json",
        success: function(data) {
          if (data && data.status == "ok") {
            isSending = false;
            setTimeout(doSendPost, 0);
          } else {
            handleError("send error: "+(data && data.status));
          }
        },
        error: function(xhr, textStatus, error) {
          handleError(textStatus); // maybe include error arguemnt here?
        }
      });
      isSending = true;
      queue = [];
    }
  }

  this.send = function(data) {
    if (state != OPEN) {
      throw Error("Can't send data on a non-open socket.");
    }
    queue.push(data);
    doSendPost();
  }
}
