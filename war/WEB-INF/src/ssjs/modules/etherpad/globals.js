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

//----------------------------------------------------------------
// global variabls
//----------------------------------------------------------------

var COMETPATH = "/comet";

var COLOR_PALETTE = ['#ffc6c6','#ffe2bf','#fffcbf','#cbffb3','#b3fff1','#c6e7ff','#dcccff','#ffd9fb'];

function isProduction() {
  // See: http://code.google.com/appengine/docs/java/runtime.html
  return (java.lang.System.getProperty("com.google.appengine.runtime.environment") == "Production");
}

var _SUPERDOMAINS = {
  'localbox.info': true,
  'localhost': true,
  'etherpad.com': true,
  'aetherpad.com': true,
  'aetherpad.appspot.com': true
};

function isASuperDomain(d) {
  return true; // for now, everything is a superdomain.
}

var PRO_FREE_ACCOUNTS = 1e9;


