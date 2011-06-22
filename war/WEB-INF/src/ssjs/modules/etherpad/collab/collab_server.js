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

import("comet");
import("ejs");
import("etherpad.collab.ace.easysync2.{AttribPool,Changeset}");
import("etherpad.log");
import("etherpad.pad.activepads");
import("etherpad.pad.model");
import("etherpad.pad.padutils");
import("etherpad.pad.padusers");
import("etherpad.pad.padevents");
import("etherpad.pad.pad_security");
import("etherpad.pro.pro_padmeta");
import("fastJSON");
import("fileutils.readFile");
import("jsutils.{eachProperty,keys}");
import("etherpad.collab.collabroom_server.*");
import("etherpad.collab.readonly_server");

var PADPAGE_ROOMTYPE = "padpage";

function onStartup() {

}

function removeFromMemory(pad) {
  // notification so we can free stuff
  if (getNumConnections(pad) == 0) {
    var tempObj = pad.tempObj();
    tempObj.revisionSockets = {};
  }
}

function _getPadConnections(pad) {
  return getRoomConnections(pad.getId(), PADPAGE_ROOMTYPE);
}

function guestKnock(globalPadId, guestId, displayName) {
  var askedSomeone = false;

  // requires that we somehow have permission on this pad
  model.accessPadGlobal(globalPadId, function(pad) {
    var connections = _getPadConnections(pad);
    connections.forEach(function(connection) {
      // only send to pro users
      if (! padusers.isGuest(connection.data.userInfo.userId)) {
        askedSomeone = true;
        var msg = { type: "SERVER_MESSAGE",
                    payload: { type: 'GUEST_PROMPT',
                               userId: guestId,
                               displayName: displayName } };
        sendMessage(connection.id, msg);
      }
    });
  });

  if (! askedSomeone) {
    pad_security.answerKnock(guestId, globalPadId, "denied");
  }
}

function _verifyUserId(userId) {
  var result;
  if (padusers.isGuest(userId)) {
    // allow cookie-verified guest even if user has signed in
    result = (userId == padusers.getGuestUserId());
  }
  else {
    result = (userId == padusers.getUserId());
  }
  return result;
}

function _checkChangesetAndPool(cs, pool) {
  Changeset.checkRep(cs);
  Changeset.eachAttribNumber(cs, function(n) {
    if (! pool.getAttrib(n)) {
      throw new Error("Attribute pool is missing attribute "+n+" for changeset "+cs);
    }
  });
}

function _doWarn(str) {
  log.warn(appjet.executionId+": "+str);
}

function _doInfo(str) {
  log.info(appjet.executionId+": "+str);
}

function _getPadRevisionSockets(pad) {
  var revisionSockets = pad.tempObj().revisionSockets;
  if (! revisionSockets) {
    revisionSockets = {}; // rev# -> socket id
    pad.tempObj().revisionSockets = revisionSockets;
  }
  return revisionSockets;
}

function applyUserChanges(pad, baseRev, changeset, optSocketId, optAuthor) {
  // changeset must be already adapted to the server's apool

  var apool = pad.pool();
  var r = baseRev;
  while (r < pad.getHeadRevisionNumber()) {
    r++;
    var c = pad.getRevisionChangeset(r);
    changeset = Changeset.follow(c, changeset, false, apool);
  }

  var prevText = pad.text();
  if (Changeset.oldLen(changeset) != prevText.length) {
    _doWarn("Can't apply USER_CHANGES "+changeset+" to document of length "+
            prevText.length);
    return;
  }

  var thisAuthor = '';
  if (optSocketId) {
    var connection = getConnection(pad.getId(), PADPAGE_ROOMTYPE, optSocketId);
    if (connection) {
      thisAuthor = connection.data.userInfo.userId;
    }
  }
  if (optAuthor) {
    thisAuthor = optAuthor;
  }

  pad.appendRevision(changeset, thisAuthor);
  var newRev = pad.getHeadRevisionNumber();
  if (optSocketId) {
    _getPadRevisionSockets(pad)[newRev] = optSocketId;
  }

  var correctionChangeset = _correctMarkersInPad(pad.atext(), pad.pool());
  if (correctionChangeset) {
    pad.appendRevision(correctionChangeset);
  }

  ///// make document end in blank line if it doesn't:
  if (pad.text().lastIndexOf("\n\n") != pad.text().length-2) {
    var nlChangeset = Changeset.makeSplice(
      pad.text(), pad.text().length-1, 0, "\n");
    pad.appendRevision(nlChangeset);
  }

  updatePadClients(pad);

  activepads.touch(pad.getId());
  padevents.onEditPad(pad, thisAuthor);
}

function updateClient(pad, conn) {
  // var conn = getConnection(pad.getId(), PADPAGE_ROOMTYPE, connectionId);
  // log.info("updating client on "+pad.getId()+" : "+(conn?conn.toSource():conn));
  // if (! conn) {
  //   return;
  // }
  var lastRev = conn.data.lastRev;
  var userId = conn.data.userInfo.userId;
  var socketId = conn.socketId;
  log.info("updating "+userId+" from "+lastRev+" to "+pad.getHeadRevisionNumber());
  while (lastRev < pad.getHeadRevisionNumber()) {
    var r = ++lastRev;
    var author = pad.getRevisionAuthor(r);
    var revisionSockets = _getPadRevisionSockets(pad);
    if (revisionSockets[r] === socketId) {
      log.info("sending ACCEPT_COMMIT");
      sendMessage(conn.socketId, {type:"ACCEPT_COMMIT", newRev:r});
    }
    else {
      var forWire = Changeset.prepareForWire(pad.getRevisionChangeset(r), pad.pool());
      var msg = {type:"NEW_CHANGES", newRev:r,
                 changeset: forWire.translated,
                 apool: forWire.pool,
                 author: author};
      log.info("sending NEW_CHANGES");
      sendMessage(conn.socketId, msg);
    }
  }
  conn.data.lastRev = pad.getHeadRevisionNumber();
  updateConnectionData(pad.getId(), PADPAGE_ROOMTYPE, conn.socketId, conn.data);
}

function updatePadClients(pad) {
  log.info("updating pad clients!");
  _getPadConnections(pad).forEach(function(connection) {
    updateClient(pad, connection);
  });

  readonly_server.updatePadClients(pad);
}

function applyMissedChanges(pad, missedChanges) {
  var userInfo = missedChanges.userInfo;
  var baseRev = missedChanges.baseRev;
  var committedChangeset = missedChanges.committedChangeset; // may be falsy
  var furtherChangeset = missedChanges.furtherChangeset; // may be falsy
  var apool = pad.pool();

  if (! _verifyUserId(userInfo.userId)) {
    return;
  }

  if (committedChangeset) {
    var wireApool1 = (new AttribPool()).fromJsonable(missedChanges.committedChangesetAPool);
    _checkChangesetAndPool(committedChangeset, wireApool1);
    committedChangeset = pad.adoptChangesetAttribs(committedChangeset, wireApool1);
  }
  if (furtherChangeset) {
    var wireApool2 = (new AttribPool()).fromJsonable(missedChanges.furtherChangesetAPool);
    _checkChangesetAndPool(furtherChangeset, wireApool2);
    furtherChangeset = pad.adoptChangesetAttribs(furtherChangeset, wireApool2);
  }

  var commitWasMissed = !! committedChangeset;
  if (commitWasMissed) {
    var commitSocketId = missedChanges.committedChangesetSocketId;
    var revisionSockets = _getPadRevisionSockets(pad);
    // was the commit really missed, or did the client just not hear back?
    // look for later changeset by this socket
    var r = baseRev;
    while (r < pad.getHeadRevisionNumber()) {
      r++;
      var s = revisionSockets[r];
      if (! s) {
        // changes are too old, have to drop them.
        return;
      }
      if (s == commitSocketId) {
        commitWasMissed = false;
        break;
      }
    }
  }
  if (! commitWasMissed) {
    // commit already incorporated by the server
    committedChangeset = null;
  }

  var changeset;
  if (committedChangeset && furtherChangeset) {
    changeset = Changeset.compose(committedChangeset, furtherChangeset, apool);
  }
  else {
    changeset = (committedChangeset || furtherChangeset);
  }

  if (changeset) {
    var author = userInfo.userId;

    applyUserChanges(pad, baseRev, changeset, null, author);
  }
}

function getAllPadsWithConnections() {
  // returns array of global pad id strings
  return [];
  //XXX return getAllRoomsOfType(PADPAGE_ROOMTYPE).map(_roomToPadId);
}

function broadcastServerMessage(msgObj) {
  var msg = {type: "SERVER_MESSAGE", payload: msgObj};
  getAllRoomsOfType(PADPAGE_ROOMTYPE).forEach(function(roomName) {
    getRoomConnections(roomName).forEach(function(connection) {
      sendMessage(connection.id, msg);
    });
  });
}

function appendPadText(pad, txt) {
  txt = model.cleanText(txt);
  var oldFullText = pad.text();
  _applyChangesetToPad(pad, Changeset.makeSplice(oldFullText,
                                                 oldFullText.length-1, 0, txt));
}

function setPadText(pad, txt) {
  txt = model.cleanText(txt);
  var oldFullText = pad.text();
  // replace text except for the existing final (virtual) newline
  _applyChangesetToPad(pad, Changeset.makeSplice(oldFullText, 0,
                                                 oldFullText.length-1, txt));
}

function setPadAText(pad, atext) {
  var oldFullText = pad.text();
  var deletion = Changeset.makeSplice(oldFullText, 0, oldFullText.length-1, "");

  var assem = Changeset.smartOpAssembler();
  Changeset.appendATextToAssembler(atext, assem);
  var charBank = atext.text.slice(0, -1);
  var insertion = Changeset.checkRep(Changeset.pack(1, atext.text.length,
    assem.toString(), charBank));

  var cs = Changeset.compose(deletion, insertion, pad.pool());
  Changeset.checkRep(cs);

  _applyChangesetToPad(pad, cs);
}

function applyChangesetToPad(pad, changeset) {
  Changeset.checkRep(changeset);

  _applyChangesetToPad(pad, changeset);
}

function _applyChangesetToPad(pad, changeset) {
  pad.appendRevision(changeset);
  updatePadClients(pad);
}

function getHistoricalAuthorData(pad, author) {
  var authorData = pad.getAuthorData(author);
  if (authorData) {
    var data = {};
    if ((typeof authorData.colorId) == "number") {
      data.colorId = authorData.colorId;
    }
    if (authorData.name) {
      data.name = authorData.name;
    }
    else {
      var uname = padusers.getNameForUserId(author);
      if (uname) {
        data.name = uname;
      }
    }
    return data;
  }
  return null;
}

function buildHistoricalAuthorDataMapFromAText(pad, atext) {
  var map = {};
  pad.eachATextAuthor(atext, function(author, authorNum) {
    var data = getHistoricalAuthorData(pad, author);
    if (data) {
      map[author] = data;
    }
  });
  return map;
}

function buildHistoricalAuthorDataMapForPadHistory(pad) {
  var map = {};
  pad.pool().eachAttrib(function(key, value) {
    if (key == 'author') {
      var author = value;
      var data = getHistoricalAuthorData(pad, author);
      if (data) {
        map[author] = data;
      }
    }
  });
  return map;
}

function getATextForWire(pad, optRev) {
  var atext;
  if ((optRev && ! isNaN(Number(optRev))) || (typeof optRev) == "number") {
    atext = pad.getInternalRevisionAText(Number(optRev));
  }
  else {
    atext = pad.atext();
  }

  var historicalAuthorData = buildHistoricalAuthorDataMapFromAText(pad, atext);

  var attribsForWire = Changeset.prepareForWire(atext.attribs, pad.pool());
  var apool = attribsForWire.pool;
  // mutate atext (translate attribs for wire):
  atext.attribs = attribsForWire.translated;

  return {atext:atext, apool:apool.toJsonable(),
          historicalAuthorData:historicalAuthorData };
}

function getCollabClientVars(pad) {
  // construct object that is made available on the client
  // as collab_client_vars

  var forWire = getATextForWire(pad);

  return {
    initialAttributedText: forWire.atext,
    rev: pad.getHeadRevisionNumber(),
    padId: pad.getLocalId(),
    globalPadId: pad.getId(),
    historicalAuthorData: forWire.historicalAuthorData,
    apool: forWire.apool,
    clientIp: request.clientAddr,
    clientAgent: request.headers["User-Agent"]
  };
}

function getNumConnections(pad) {
  return _getPadConnections(pad).length;
}

function getConnectedUsers(pad) {
  var users = [];
  _getPadConnections(pad).forEach(function(connection) {
    users.push(connection.data.userInfo);
  });
  return users;
}


function bootAllUsersFromPad(pad, reason) {
  return bootUsersFromPad(pad, reason);
}

function bootUsersFromPad(pad, reason, userInfoFilter) {
  var connections = _getPadConnections(pad);
  var bootedUserInfos = [];
  connections.forEach(function(connection) {
    if ((! userInfoFilter) || userInfoFilter(connection.data.userInfo)) {
      bootedUserInfos.push(connection.data.userInfo);
      bootConnectionOLD(connection.id);
    }
  });
  return bootedUserInfos;
}

function dumpStorageToString(pad) {
  var lines = [];
  var errors = [];
  var head = pad.getHeadRevisionNumber();
  try {
    for(var i=0;i<=head;i++) {
      lines.push("changeset "+i+" "+Changeset.toBaseTen(pad.getRevisionChangeset(i)));
    }
  }
  catch (e) {
    errors.push("!!!!! Error in changeset "+i+": "+e.message);
  }
  for(var i=0;i<=head;i++) {
    lines.push("author "+i+" "+pad.getRevisionAuthor(i));
  }
  for(var i=0;i<=head;i++) {
    lines.push("time "+i+" "+pad.getRevisionDate(i));
  }
  var revisionSockets = _getPadRevisionSockets(pad);
  for(var k in revisionSockets) lines.push("socket "+k+" "+revisionSockets[k]);
  return errors.concat(lines).join('\n');
}

function _serverDebug(msg) { /* nothing */ }

function _accessCollabPad(padId, accessType, padFunc, dontRequirePad) {
  if (! padId) {
    if (! dontRequirePad) {
      _doWarn("Collab operation \""+accessType+"\" aborted.");
    }
    return;
  }
  else {
    return _accessExistingPad(padId, accessType, function(pad) {
      return padFunc(pad);
    }, dontRequirePad);
  }
}

function _accessExistingPad(padId, accessType, padFunc, dontRequireExist) {
  return model.accessPadGlobal(padId, function(pad) {
    if (! pad.exists()) {
      if (! dontRequireExist) {
        _doWarn("Collab operation \""+accessType+"\" aborted because pad "+padId+" doesn't exist.");
      }
      return;
    }
    else {
      return padFunc(pad);
    }
  });
}

function _handlePadUserInfo(pad, userInfo) {
  var author = userInfo.userId;
  var colorId = Number(userInfo.colorId);
  var name = userInfo.name;

  if (! author) return;

  // update map from author to that author's last known color and name
  var data = {colorId: colorId};
  if (name) data.name = name;
  pad.setAuthorData(author, data);
  padusers.notifyUserData(data);
}

function _filterUserInfos(userInfos) {
  return userInfos.filter(function (userInfo) {
    return translateSpecialKey(userInfo.specialKey) != 'invisible';
  });
}

function _sendUserInfoMessage(connectionId, type, userInfos) {
  sendMessage(connectionId, {type: type,
                             userInfos: _filterUserInfos(userInfos) });
}

function _sendUserInfoMessageToPad(padId, type, userInfos) {
  sendRoomMessage(padId, PADPAGE_ROOMTYPE,
                  {type: type, userInfos: _filterUserInfos(userInfos) });
}

function getRoomCallbacks(padId) {
  var callbacks = {};
  callbacks.introduceUsers =
    function (connections) {
      // notify users of each other
      var userInfos = [];
      eachProperty(connections, function(socketId, conn) {
        userInfos.push(conn.data.userInfo);
      });
      _sendUserInfoMessageToPad(padId,
                                "USER_NEWINFO",
                                userInfos);
    };
  callbacks.extroduceUsers =
    function (leavingConnection) {
      _sendUserInfoMessageToPad(padId, "USER_LEAVE",
                                [leavingConnection.data.userInfo]);
    };
  callbacks.onAddConnection =
    function (data) {
      model.accessPadGlobal(padId, function(pad) {
        _handlePadUserInfo(pad, data.userInfo);
        padevents.onUserJoin(pad, data.userInfo);
        //XXX readonly_server.updateUserInfo(pad, data.userInfo);
      });
    };
  callbacks.onRemoveConnection =
    function (data) {
      model.accessPadGlobal(padId, function(pad) {
        padevents.onUserLeave(pad, data.userInfo);
      });
    };
  callbacks.handleConnect =
    function (data) {
      if (! (data.userInfo && data.userInfo.userId &&
             _verifyUserId(data.userInfo.userId))) {
        return null;
      }
      return data.userInfo;
    };
  callbacks.clientReady =
    function(newConnection, data) {
      if (data.stats) {
        log.custom("padclientstats", {padId:padId, stats:data.stats});
      }

      var lastRev = data.lastRev;
      var isReconnectOf = data.isReconnectOf;
      var isCommitPending = !! data.isCommitPending;
      var socketId = newConnection.socketId;

      newConnection.data.lastRev = lastRev;
      updateConnectionData(padId, PADPAGE_ROOMTYPE, socketId, newConnection.data);

      if (padutils.isProPadId(padId)) {
        pro_padmeta.accessProPad(padId, function(propad) {
          // tell client about pad title
          sendMessage(socketId, {type: "CLIENT_MESSAGE", payload: {
            type: "padtitle", title: propad.getDisplayTitle() } });
          sendMessage(socketId, {type: "CLIENT_MESSAGE", payload: {
            type: "padpassword", password: propad.getPassword() } });
        });
      }

      _accessExistingPad(padId, "CLIENT_READY", function(pad) {
        sendMessage(socketId, {type: "CLIENT_MESSAGE", payload: {
          type: "padoptions", options: pad.getPadOptionsObj() } });

        //updateClient(pad, connectionId);

      });

      if (isCommitPending) {
        // tell client that if it hasn't received an ACCEPT_COMMIT by now, it isn't coming.
        sendMessage(socketId, {type:"NO_COMMIT_PENDING"});
      }
    };
  callbacks.handleMessage = function(connection, msg) {
    _handleCometMessage(padId, connection, msg);
  };
  return callbacks;
}

var _specialKeys = [['x375b', 'invisible']];

function translateSpecialKey(specialKey) {
  // code -> name
  for(var i=0;i<_specialKeys.length;i++) {
    if (_specialKeys[i][0] == specialKey) {
      return _specialKeys[i][1];
    }
  }
  return null;
}

function getSpecialKey(name) {
  // name -> code
  for(var i=0;i<_specialKeys.length;i++) {
    if (_specialKeys[i][1] == name) {
      return _specialKeys[i][0];
    }
  }
  return null;
}

function _updateDocumentConnectionUserInfo(pad, socketId, userInfo) {
  var padId = pad.getId();
  var conn = getConnection(padId, PADPAGE_ROOMTYPE, socketId);
  if (conn) {

    _sendUserInfoMessageToPad(padId, "USER_NEWINFO", [userInfo]);

    conn.data.userInfo = userInfo;
    updateConnectionData(padId, PADPAGE_ROOMTYPE, socketId, conn.data);

    _handlePadUserInfo(pad, userInfo);
    padevents.onUserInfoChange(pad, userInfo);
    //XXX readonly_server.updateUserInfo(pad, userInfo);
  }
}

function _handleCometMessage(padId, connection, msg) {

  var socketUserId = connection.data.userInfo.userId;
  if (! (socketUserId && _verifyUserId(socketUserId))) {
    // user has signed out or cleared cookies, no longer auth'ed
    bootConnection(padId, PADPAGE_ROOMTYPE,
                   connection.socketId, "unauth");
  }

  if (msg.type == "USER_CHANGES") {
    try {
      _accessCollabPad(padId, "USER_CHANGES", function(pad) {
        var baseRev = msg.baseRev;
        var wireApool = (new AttribPool()).fromJsonable(msg.apool);
        var changeset = msg.changeset;
        if (changeset) {
          _checkChangesetAndPool(changeset, wireApool);
          changeset = pad.adoptChangesetAttribs(changeset, wireApool);
          applyUserChanges(pad, baseRev, changeset, connection.socketId);
        }
      });
    }
    catch (e if e.easysync) {
      _doWarn("Changeset error handling USER_CHANGES: "+e);
    }
  }
  else if (msg.type == "USERINFO_UPDATE") {
    _accessCollabPad(padId, "USERINFO_UPDATE", function(pad) {
      var userInfo = msg.userInfo;
      // security check
      if (userInfo.userId == connection.data.userInfo.userId) {
        _updateDocumentConnectionUserInfo(pad,
                                          connection.socketId, userInfo);
      }
      else {
        // drop on the floor
      }
    });
  }
  else if (msg.type == "CLIENT_MESSAGE") {
    _accessCollabPad(padId, "CLIENT_MESSAGE", function(pad) {
      var payload = msg.payload;
      if (payload.authId &&
          payload.authId != connection.data.userInfo.userId) {
        // authId, if present, must actually be the sender's userId;
        // here it wasn't
      }
      else {
        sendRoomMessage(padId, PADPAGE_ROOMTYPE,
                        {type: "CLIENT_MESSAGE", payload: payload,
                         originator: msg.originator});
        padevents.onClientMessage(pad, connection.data.userInfo,
                                  payload);
      }
    });
  }
}

function _correctMarkersInPad(atext, apool) {
  var text = atext.text;

  // collect char positions of line markers (e.g. bullets) in new atext
  // that aren't at the start of a line
  var badMarkers = [];
  var iter = Changeset.opIterator(atext.attribs);
  var offset = 0;
  while (iter.hasNext()) {
    var op = iter.next();
    var listValue = Changeset.opAttributeValue(op, 'list', apool);
    if (listValue) {
      for(var i=0;i<op.chars;i++) {
        if (offset > 0 && text.charAt(offset-1) != '\n') {
          badMarkers.push(offset);
        }
        offset++;
      }
    }
    else {
      offset += op.chars;
    }
  }

  if (badMarkers.length == 0) {
    return null;
  }

  // create changeset that removes these bad markers
  offset = 0;
  var builder = Changeset.builder(text.length);
  badMarkers.forEach(function(pos) {
    builder.keepText(text.substring(offset, pos));
    builder.remove(1);
    offset = pos+1;
  });
  return builder.toString();
}
