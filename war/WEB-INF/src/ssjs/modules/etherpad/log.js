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

import("gae.dsobj");
import("stringutils.startsWith");
import("sync.{callsync,callsyncIfTrue}");
import("jsutils.*");
import("exceptionutils");

import("etherpad.globals.*");
import("etherpad.pad.padutils");
import("etherpad.sessions");
import("etherpad.utils.*");
import("fastJSON");

import("etherpad.pro.pro_accounts.getSessionProAccount");

jimport("java.io.FileWriter");
jimport("java.lang.System.out.println");
jimport("java.io.File");
jimport("java.util.logging.Logger");
jimport("net.appjet.ajstdlib.execution");


function _log(name, m) {
  if (typeof(m) != 'string') {
    if (typeof(m) == 'object') {
      m = fastJSON.stringify(m);
    } else {
      m = String(m);
    }
  }

  switch (name) {
    case 'info':
      Logger.getLogger("etherpad").info(m);
      break;
    case 'warn':
      Logger.getLogger("etherpad").warning(m);
      break;
    case 'exception':
      Logger.getLogger("etherpad").severe(m);
      break;
    default:
      Logger.getLogger(name).info(m);
  }
}

function custom(name, m) {
  _log(name, m);
}


//----------------------------------------------------------------
// logException
//----------------------------------------------------------------

function logException(ex) {
  if (typeof(ex) != 'object' || ! (ex instanceof java.lang.Throwable)) {
    ex = new java.lang.RuntimeException(String(ex));
  }
  // NOTE: ex is always a java.lang.Throwable
  var jsTrace = exceptionutils.getStackTracePlain(ex);
  var s = new java.io.StringWriter();
  ex.printStackTrace(new java.io.PrintWriter(s));
  var trace = s.toString();
  _log("exception", jsTrace);
  _log("exception", trace);
}

function callCatchingExceptions(func) {
  try {
    return func();
  }
  catch (e) {
    logException(toJavaException(e));
  }
  return undefined;
}

//----------------------------------------------------------------
// warning
//----------------------------------------------------------------
function warn(m) { _log("warn", m); }
function info(m) { _log("info", m); }


// TODO: why is this in log.js?

function onUserJoin(userId) {
  function doUpdate() {
    dsobj.update('pad_cookie_userids', {id: userId}, {lastActiveDate: new Date()});
  }
  try {
    dsobj.inTransaction(function() {
      if (dsobj.selectSingle('pad_cookie_userids', {id: userId})) {
        doUpdate();
      } else {
        dsobj.insert('pad_cookie_userids',
                      {id: userId, createdDate: new Date(), lastActiveDate: new Date()});
      }
    });
  }
  catch (e) {
    dsobj.inTransaction(function() {
      doUpdate();
    });
  }
}

