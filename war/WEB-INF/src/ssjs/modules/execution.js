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

import("jsutils.{scalaF0,scalaF1}");

/**
 * Asynchronously call a function as soon as the current request completes.
 **/
function async(f) {
  throw Error("Not implemented.");
  Packages.net.appjet.ajstdlib.execution.runAsync(appjet.context, f);
}

function initTaskThreadPool(name, poolSize) {
  throw Error("Not implemented.");
  Packages.net.appjet.ajstdlib.execution.createNamedTaskThreadPool(name, poolSize);
}

function scheduleTask(poolName, taskName, delayMillis, args) {
  throw Error("Not implemented.");
  return Packages.net.appjet.ajstdlib.execution.scheduleTaskInPool(poolName, taskName, delayMillis, args);
}

function shutdownAndWaitOnTaskThreadPool(poolName, timeoutMillis) {
  throw Error("Not implemented.");
  return Packages.net.appjet.ajstdlib.execution.shutdownAndWaitOnTaskThreadPool(poolName, timeoutMillis);
}

function fancyAssEval(initCode, mainCode) {
  function init(scope) {
    Packages.appjet.BodyLock.evaluateString(
      scope,
      initCode,
      "eval'd code imports",
      1);
  }
  return Packages.appjet.ScopeManager.withTransientScope(scalaF1(init), scalaF1(function(scope) {
    var ec = new Packages.appjet.ExecutionContext(
      request.underlying, null, scope);
    return Packages.appjet.ExecutionContextUtils.withContext(ec, scalaF0(function() {
      return Packages.appjet.BodyLock.evaluateString(
        Packages.appjet.BodyLock.subScope(scope.mainRhinoScope()),
        mainCode,
        "eval'd code main",
        1);
    }));
  }));
}