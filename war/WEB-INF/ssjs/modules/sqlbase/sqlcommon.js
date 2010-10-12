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

import("jsutils.scalaF1")
import("stringutils.startsWith");
import("datastore");

jimport("net.appjet.ajstdlib.SQLBase");
jimport("java.lang.System.out.println");


function btquote(x) { return "`"+x+"`"; }

function getSqlBase() { return null; }

function inTransaction(f) {
  return datastore.inTransaction(null, f);
}

function withConnection(f) {
  return f(null);
}

function closing(obj, f) {
  try {
    f();
  } finally {
    obj.close();
  }
}