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

var _SESSION_ATTR = "sessionDataRoot";

function getSession(opts) {
  var httpSession = request.session(true);
  if (! httpSession.getAttribute(_SESSION_ATTR)) {
    httpSession.setAttribute(_SESSION_ATTR, {});
  }
  var sessionRoot = httpSession.getAttribute(_SESSION_ATTR);
  var domainKey = (opts.domain ? opts.domain : "");
  var dataKey = [domainKey, httpSession.getId()].join("$");
  if (! sessionRoot[dataKey]) {
    sessionRoot[dataKey] = {};
  }
  return sessionRoot[dataKey];
}

