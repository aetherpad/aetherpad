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

import("dateutils");
import("fastJSON");
import("fileutils");
import("jsutils.{eachProperty,keys}");
import("stringutils.{randomHash,startsWith,endsWith}");
import("sync");

jimport("net.appjet.common.util.ExpiringMapping");

//----------------------------------------------------------------

var _DEFAULT_COOKIE_NAME = "SessionID";
var _DEFAULT_SERVER_EXPIRATION = 3*24*60*60*1000; // 72 hours

function getSessionId(createIfNotPresent) {
  if (request.isComet || request.isCron) {
    return null;
  }

  var httpSession = request.session(createIfNotPresent);
  return httpSession.getId();
}

//----------------------------------------------------------------

function getSession(opts) {
  var httpSession = request.session(true);
  if (! httpSession.getAttribute("sessionDataRoot")) {
    httpSession.setAttribute("sessionDataRoot", {});
  }
  var sessionRoot = httpSession.getAttribute("sessionDataRoot");
  
  var domainKey = (opts.domain ? opts.domain : "");
  var dataKey = [domainKey, httpSession.getId()].join("$");
  if (! sessionRoot[dataKey]) {
    sessionRoot[dataKey] = {};
  }
  return sessionRoot[dataKey];
  
  // // Session options.
  // if (!opts) { opts = {}; }
  // var cookieName = opts.cookieName || _DEFAULT_COOKIE_NAME;
  // 
  // // get cookie ID (sets response cookie if necessary)
  // var sessionId = getSessionId(cookieName, true, opts.domain);
  // 
  // // get expiring session map
  // var db = _getCachedDb();
  // var map = _getExpiringSessionMap(db);
  // 
  // // get session data object
  // var domainKey = (opts.domain ? opts.domain : "");
  // var dataKey = [domainKey, sessionId].join('$');
  // 
  // var sessionData = map.get(dataKey);
  // if (!sessionData) {
  //   sessionData = {};
  //   map.put(dataKey, sessionData);
  // }
  // else {
  //   map.touch(dataKey);
  // }
  // 
  // return sessionData;
}
