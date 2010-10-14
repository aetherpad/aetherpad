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

import("etherpad.globals.*");
import("etherpad.utils.*");

jimport("java.lang.System.out.println");

//----------------------------------------------------------------
var tests = [
  "t0000_test",
  "t0001_sqlbase_transaction_rollback",
  "t0002_license_generation",
  "t0003_persistent_vars",
  "t0004_sqlobj",
  "t0005_easysync"
];

var tscope = this;
tests.forEach(function(t) {
  import.call(tscope, 'etherpad.testing.unit_tests.'+t);
});
//----------------------------------------------------------------

function _testName(x) {
  x = x.replace(/^t\d+\_/, '');
  return x;
}

function render_run() {
  response.setContentType("text/plain; charset=utf-8");
  if (isProduction() && (request.params.p != "waverunner")) {
    response.write("access denied");
    response.stop();
  }

  var singleTest = request.params.t;
  var numRun = 0;

  println("----------------------------------------------------------------");
  println("running tests");
  println("----------------------------------------------------------------");
  tests.forEach(function(t) {
    var testName = _testName(t);
    if (singleTest && (singleTest != testName)) {
      return;
    }
    println("running test: "+testName);
    numRun++;
    tscope[t].run();
    println("|| pass ||");
  });
  println("----------------------------------------------------------------");

  if (numRun == 0) {
    response.write("Error: no tests found");
  } else {
    response.write("OK");
  }
}

import("datastore");
jimport("com.google.appengine.api.datastore.Entity");
jimport("com.google.appengine.api.datastore.KeyFactory");

function render_dstest1() {
  var keyName = request.params.name;
  var ds = datastore.getDatastoreService();
  var ent = new Entity("testcontrol.kind", String(keyName), null);
  ent.setProperty("hi", "there");
  ds.put(ent);
  response.redirect("/ep/test/dstest2?name="+keyName);
}

function render_dstest2() {
  var keyName = request.params.name;
  var ds = datastore.getDatastoreService();
  var ent = ds.get(KeyFactory.createKey(null, "testcontrol.kind", keyName));
  
  response.write("hi? "+ent.getProperty("hi"));
}

