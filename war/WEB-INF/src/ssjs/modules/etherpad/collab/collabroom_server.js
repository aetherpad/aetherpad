/**
 * Copyright 2009 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import("execution");
import("fastJSON");
import("cache_utils.syncedWithCache");
import("etherpad.collab.collab_server");
import("etherpad.collab.readonly_server");
import("etherpad.log");
jimport("java.util.concurrent.ConcurrentSkipListMap");
jimport("java.util.concurrent.CopyOnWriteArraySet");
import("gae.datastore");
import("gae.dsobj");
import("gae.channel");

function _doWarn(str) {
  log.warn(appjet.executionId+": "+str);
}

function _memcache() {
  // increment "version number" of namespace
  // to essentially clear all connections
  // when uploading a new app version
  return memcache.ns("collabroom_server-1");
}

// helper functions that treat the memcache key
// as a JavaScript value, by making it a value
// in a JSON-stringified object
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

function getConnections(padId, roomType) {
  return _getObj(padId+","+roomType) || {};
}

function modifyConnections(padId, roomType, func) {
  _performAtomicObj(padId+","+roomType, func, {});
}


function _putConnection(connection) {
  var connectionDS = {
    id: connection.id,
    roomName: connection.roomName,
    type: connection.type,
    socketId: connection.socketId
  };
  if (connection.data) {
    connectionDS.data =
      fastJSON.stringify(connection.data);
  }

  dsobj.insert(_connectionsTable(), connectionDS);
}

function _removeConnection(connection) {
  dsobj.deleteRows(_connectionsTable(), {id: connection.id});
}

function _updateConnectionData(connectionId, data) {
  dsobj.updateSingle(_connectionsTable(),
                      {id: connectionId},
                      {data: fastJSON.stringify(data)});
}

function _modDSConnection(connection) {
  if (connection && connection.data) {
    connection.data = fastJSON.parse(connection.data);
  }
  return connection;
}

function _getConnection(connectionId) {
  var connection =
    dsobj.selectSingle(_connectionsTable(), {id: connectionId});

  return _modDSConnection(connection);
}

function _getConnections(roomName) {
  var connections =
    dsobj.selectMulti(_connectionsTable(), {roomName:roomName});

  return connections.map(_modDSConnection);
}

function sendMessage(connectionId, msg) {
  var connection = _getConnection(connectionId);
  if (connection) {
    _sendMessageToSocket(connection.socketId, msg);
  }
}

function _sendMessageToSocket(socketId, msg, andDisconnect) {
  var msgString = fastJSON.stringify({type: "COLLABROOM", data: msg});
  if (andDisconnect) {
    channel.sendDisconnect(socketId, msgString);
  }
  else {
    channel.sendMessage(socketId, msgString);
  }
}

// function disconnectDefunctSocket(connectionId, socketId) {
//   var connection = _getConnection(connectionId);
//   if (connection && connection.socketId == socketId) {
//     _removeRoomConnection(connectionId);
//   }
// }

function _bootSocket(socketId, reason) {
  _sendMessageToSocket(socketId,
                       {type: "DISCONNECT_REASON", reason: reason},
		       true);
}

function bootConnection(connectionId, reason) {
  var connection = _getConnection(connectionId);
  if (connection) {
    _bootSocket(connection.socketId, reason);
    _removeRoomConnection(connectionId);
  }
}

function _getCallbacksForRoom(roomName, roomType) {
  var emptyCallbacks = {};
  emptyCallbacks.introduceUsers =
    function (joiningConnection, existingConnection) {};
  emptyCallbacks.extroduceUsers =
    function extroduceUsers(leavingConnection, existingConnection) {};
  emptyCallbacks.onAddConnection = function (joiningData) {};
  emptyCallbacks.onRemoveConnection = function (leavingData) {};
  emptyCallbacks.handleConnect =
    function(data) { return /*userInfo or */null; };
  emptyCallbacks.clientReady = function(newConnection, data) {};
  emptyCallbacks.handleMessage = function(connection, msg) {};

  if (roomType == collab_server.PADPAGE_ROOMTYPE) {
    return collab_server.getRoomCallbacks(roomName, emptyCallbacks);
  }
  /*else if (roomType == readonly_server.PADVIEW_ROOMTYPE) {
    return readonly_server.getRoomCallbacks(roomName, emptyCallbacks);
  }*/ //XXX not ported yet
  else {
    //java.lang.System.out.println("UNKNOWN ROOMTYPE: "+roomType);
    return emptyCallbacks;
  }
}

// roomName must be globally unique, just within roomType;
// data must have a userInfo.userId
function _addRoomConnection(roomName, roomType,
                           connectionId, socketId, data) {
  var callbacks = _getCallbacksForRoom(roomName, roomType);

  bootConnection(connectionId, "userdup");

  var joiningConnection = {id:connectionId,
                           roomName:roomName,
                           type:roomType,
                           socketId:socketId,
                           data:data};
  _putConnection(joiningConnection);

  var connections = _getConnections(roomName);
  var joiningUser = data.userInfo.userId;

  connections.forEach(function(connection) {
    if (connection.socketId != socketId) {
      var user = connection.data.userInfo.userId;
      if (user == joiningUser) {
        bootConnection(connection.id, "userdup");
      }
      else {
        callbacks.introduceUsers(joiningConnection, connection);
      }
    }
  });

  callbacks.onAddConnection(data);

  return joiningConnection;
}

function _removeRoomConnection(connectionId) {
  var leavingConnection = _getConnection(connectionId);
  if (leavingConnection) {
    var roomName = leavingConnection.roomName;
    var roomType = leavingConnection.type;
    var callbacks = _getCallbacksForRoom(roomName, roomType);

    _removeConnection(leavingConnection);

    _getConnections(roomName).forEach(function (connection) {
      callbacks.extroduceUsers(leavingConnection, connection);
    });

    callbacks.onRemoveConnection(leavingConnection.data);
  }
}

function getConnection(connectionId) {
  return _getConnection(connectionId);
}

function updateRoomConnectionData(connectionId, data) {
  _updateConnectionData(connectionId, data);
}

function getRoomConnections(roomName) {
  return _getConnections(roomName);
}

function getAllRoomsOfType(roomType) {
  return [];
/*
  var connections =
    dsobj.selectMulti(_connectionsTable(),
                       {type: roomType},
                       {orderBy:"roomName"});

  var array = [];
  connections.forEach(function (c) {
    var roomName = c.roomName;
    // connections are sorted by roomName,
    // so duplicate roomNames are consecutive
    // in 'connections'
    if (array.length == 0 ||
        array[array.length-1] != roomName) {
      array.push(roomName);
    }
  });
  return array;
*/
}

function getSocketConnectionId(socketId) {
  var connection =
    dsobj.selectSingle(_connectionsTable(),
                        {socketId: socketId});

  return (connection && connection.id) || null;
}

function handleComet(cometOp, cometId, msg) {
  var cometEvent = cometOp;

  function requireTruthy(x, id) {
    if (!x) {
      _doWarn("Collab operation rejected due to missing value, case "+id);
      if (messageSocketId) {
        //comet.disconnect(messageSocketId);
      }
      response.stop();
    }
    return x;
  }

  if (cometEvent != "disconnect" && cometEvent != "message") {
    response.stop();
  }

  var messageSocketId = requireTruthy(cometId, 2);
  var messageConnectionId = getSocketConnectionId(messageSocketId);

  if (cometEvent == "disconnect") {
    if (messageConnectionId) {
      _removeRoomConnection(messageConnectionId);
    }
  }
  else if (cometEvent == "message") {
    if (msg.type == "CLIENT_READY") {
      var roomType = requireTruthy(msg.roomType, 4);
      var roomName = requireTruthy(msg.roomName, 11);

      var socketId = messageSocketId;
      var connectionId = messageSocketId;
      var clientReadyData = requireTruthy(msg.data, 12);

      var callbacks = _getCallbacksForRoom(roomName, roomType);
      var userInfo =
        requireTruthy(callbacks.handleConnect(clientReadyData), 13);

      var newConnection = _addRoomConnection(roomName, roomType,
                                            connectionId, socketId,
                                            {userInfo: userInfo});

      callbacks.clientReady(newConnection, clientReadyData);
    }
    else {
      if (messageConnectionId) {
        var connection = getConnection(messageConnectionId);
        if (connection) {
          var callbacks = _getCallbacksForRoom(
            connection.roomName, connection.type);
          callbacks.handleMessage(connection, msg);
        }
      }
    }
  }
}
