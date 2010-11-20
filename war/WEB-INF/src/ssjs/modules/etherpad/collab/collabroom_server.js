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
import("jsutils.eachProperty");
import("jsutils.keys");
import("gae.memcache");

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
  return fastJSON.parse(
    _memcache().performAtomic(key, function(json) {
      return fastJSON.stringify({x: func(fastJSON.parse(json).x)});
    }, fastJSON.stringify({x:initialValue}))).x;
}

function getConnections(padId, roomType) {
  return _getObj(padId+","+roomType) || {};
}

function modifyConnections(padId, roomType, func) {
  // func can either mutate the connections in-place
  // or return a new map
  return _performAtomicObj(
    padId+","+roomType,
    function(conns) {
      return func(conns) || conns;
    },
    {});
}

function getConnection(padId, roomType, socketId) {
  return getConnections(padId, roomType)[socketId] || null;
}

function removeConnection(padId, roomType, socketId) {
  return modifyConnections(padId, roomType, function(conns) {
    delete conn[socketId];
  });
}

function updateConnectionData(padId, roomType, socketId, data) {
  modifyConnections(padId, roomType, function(conns) {
    if (conns[socketId]) {
      conns[socketId].data = data;
    }
  });
}

function _addConnection(padId, roomType,
                        joiningSocket, data) {

  var joiningConnection = {data:data, socketId:joiningSocket};
  var joiningUser = data.userInfo.userId;
  var socketsToBoot = [];

  var connections = modifyConnections(padId, roomType, function(conns) {
    eachProperty(conns, function(socketId, conn) {
      if (conn.data.userInfo.userId == joiningUser) {
	socketsToBoot.push(socketId);
      }
    });
    socketsToBoot.forEach(function(socketId) {
      delete conns[socketId];
    });

    conns[joiningSocket] = joiningConnection;
  });

  socketsToBoot.forEach(function(socketId) {
    _bootSocket(socketId, "userdup");
  });

  var callbacks = _getCallbacksForRoom(padId, roomType);
  callbacks.introduceUsers(connections);
  callbacks.onAddConnection(data);

  return joiningConnection;
}

function bootConnection(padId, roomType, socketId, reason) {
  _bootSocket(socketId, reason);
  return removeConnection(padId, roomType, socketId);
}

// function _putConnection(connection) {
//   var connectionDS = {
//     id: connection.id,
//     roomName: connection.roomName,
//     type: connection.type,
//     socketId: connection.socketId
//   };
//   if (connection.data) {
//     connectionDS.data =
//       fastJSON.stringify(connection.data);
//   }

//   dsobj.insert(_connectionsTable(), connectionDS);
// }

// function _removeConnection(connection) {
//   dsobj.deleteRows(_connectionsTable(), {id: connection.id});
// }

// function _updateConnectionData(connectionId, data) {
//   dsobj.updateSingle(_connectionsTable(),
//                       {id: connectionId},
//                       {data: fastJSON.stringify(data)});
// }

// function _modDSConnection(connection) {
//   if (connection && connection.data) {
//     connection.data = fastJSON.parse(connection.data);
//   }
//   return connection;
// }

// function _getConnection(connectionId) {
//   var connection =
//     dsobj.selectSingle(_connectionsTable(), {id: connectionId});

//   return _modDSConnection(connection);
// }

// function _getConnections(roomName) {
//   var connections =
//     dsobj.selectMulti(_connectionsTable(), {roomName:roomName});

//   return connections.map(_modDSConnection);
// }

// function sendMessage(connectionId, msg) {
//   var connection = _getConnection(connectionId);
//   if (connection) {
//     _sendMessageToSocket(connection.socketId, msg);
//   }
// }

function sendRoomMessage(padId, roomType, msg) {
  var connections = getConnections(padId, roomType);
  var msgString = fastJSON.stringify({type: "COLLABROOM", data: msg});
  channel.sendMessageBatch(keys(connections), msgString);
}

function sendMessage(socketId, msg) {
  _sendMessageToSocket(socketId, msg);
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

// // function disconnectDefunctSocket(connectionId, socketId) {
// //   var connection = _getConnection(connectionId);
// //   if (connection && connection.socketId == socketId) {
// //     _removeRoomConnection(connectionId);
// //   }
// // }

function _bootSocket(socketId, reason) {
  _sendMessageToSocket(socketId,
                       {type: "DISCONNECT_REASON", reason: reason},
 		       true);
}

// function bootConnection(connectionId, reason) {
//   var connection = _getConnection(connectionId);
//   if (connection) {
//     _bootSocket(connection.socketId, reason);
//     _removeRoomConnection(connectionId);
//   }
// }

function _getCallbacksForRoom(padId, roomType) {
  var emptyCallbacks = {};
  emptyCallbacks.introduceUsers = function (connections) {};
  emptyCallbacks.extroduceUsers =
    function extroduceUsers(leavingConnection) {};
  emptyCallbacks.onAddConnection = function (joiningData) {};
  emptyCallbacks.onRemoveConnection = function (leavingData) {};
  emptyCallbacks.handleConnect =
    function(data) { return /*userInfo or */null; };
  emptyCallbacks.clientReady = function(newConnection, data) {};
  emptyCallbacks.handleMessage = function(connection, msg) {};

  if (roomType == collab_server.PADPAGE_ROOMTYPE) {
    return collab_server.getRoomCallbacks(padId, emptyCallbacks);
  }
  /*else if (roomType == readonly_server.PADVIEW_ROOMTYPE) {
    return readonly_server.getRoomCallbacks(roomName, emptyCallbacks);
  }*/ //XXX not ported yet
  else {
    //java.lang.System.out.println("UNKNOWN ROOMTYPE: "+roomType);
    return emptyCallbacks;
  }
}

// // roomName must be globally unique, just within roomType;
// // data must have a userInfo.userId
// function _addRoomConnection(roomName, roomType,
//                            connectionId, socketId, data) {
//   var callbacks = _getCallbacksForRoom(roomName, roomType);

//   bootConnection(connectionId, "userdup");

//   var joiningConnection = {id:connectionId,
//                            roomName:roomName,
//                            type:roomType,
//                            socketId:socketId,
//                            data:data};
//   _putConnection(joiningConnection);

//   var connections = _getConnections(roomName);
//   var joiningUser = data.userInfo.userId;

//   connections.forEach(function(connection) {
//     if (connection.socketId != socketId) {
//       var user = connection.data.userInfo.userId;
//       if (user == joiningUser) {
//         bootConnection(connection.id, "userdup");
//       }
//       else {
//         callbacks.introduceUsers(joiningConnection, connection);
//       }
//     }
//   });

//   callbacks.onAddConnection(data);

//   return joiningConnection;
// }

function _removeUserSocket(padId, roomType, socketId) {
  var leavingConnection = getConnection(padId, roomType, socketId);

  if (leavingConnection) {
    removeConnection(padId, roomType, socketId);

    var callbacks = _getCallbacksForRoom(padId, roomType);

    callbacks.extroduceUsers(leavingConnection);
    callbacks.onRemoveConnection(leavingConnection.data);
  }
}

// function getConnection(connectionId) {
//   return _getConnection(connectionId);
// }

// function updateRoomConnectionData(connectionId, data) {
//   _updateConnectionData(connectionId, data);
// }

function getRoomConnections(padId, roomType) {
  var conns = [];
  eachProperty(getConnections(padId, roomType),
	       function(socketId, conn) {
		 conns.push(conn);
	       });
  return conns;
}

// function getAllRoomsOfType(roomType) {
//   return [];
// /*
//   var connections =
//     dsobj.selectMulti(_connectionsTable(),
//                        {type: roomType},
//                        {orderBy:"roomName"});

//   var array = [];
//   connections.forEach(function (c) {
//     var roomName = c.roomName;
//     // connections are sorted by roomName,
//     // so duplicate roomNames are consecutive
//     // in 'connections'
//     if (array.length == 0 ||
//         array[array.length-1] != roomName) {
//       array.push(roomName);
//     }
//   });
//   return array;
// */
// }

// function getSocketConnectionId(socketId) {
//   var connection =
//     dsobj.selectSingle(_connectionsTable(),
//                         {socketId: socketId});

//   return (connection && connection.id) || null;
// }

function handleComet(cometOp, cometId, wrappedMsg) {
  var cometEvent = cometOp;

  function requireTruthy(x, id) {
    if (!x) {
      _doWarn("Collab operation rejected due to missing value, case "+id);
      channel.sendDisconnect(socketId);
      response.stop();
    }
    return x;
  }

  if (cometEvent != "disconnect" && cometEvent != "message") {
    response.stop();
  }

  var socketId = requireTruthy(cometId, 2);
  var msg = wrappedMsg.data;
  var padId = requireTruthy(wrappedMsg.padId, 4);
  var roomType = requireTruthy(wrappedMsg.roomType, 11);

  if (cometEvent == "disconnect") {
    _removeUserSocket(padId, roomType, socketId);
  }
  else if (cometEvent == "message") {
    if (msg.type == "CLIENT_READY") {
      var clientReadyData = requireTruthy(msg.data, 12);

      var callbacks = _getCallbacksForRoom(padId, roomType);

      var userInfo =
        requireTruthy(callbacks.handleConnect(clientReadyData), 13);

      var newConnection = _addConnection(padId, roomType,
                                         socketId, {userInfo: userInfo});

      callbacks.clientReady(newConnection, clientReadyData);
    }
    else {
      var connection = getConnection(padId, roomType, socketId);
      if (connection) {
	var callbacks = _getCallbacksForRoom(padId, roomType);
	callbacks.handleMessage(connection, msg);
      }
    }
  }
}
