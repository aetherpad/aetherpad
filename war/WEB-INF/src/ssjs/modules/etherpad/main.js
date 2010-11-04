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

import("dispatch.{Dispatcher,PrefixMatcher,DirMatcher,forward}");
import("exceptionutils");
import("fastJSON");
import("jsutils.*");
import("stringutils");

import("etherpad.globals.*");
import("etherpad.log");
import("etherpad.utils.*");
import("etherpad.sessions");
import("etherpad.importexport.importexport");
import("etherpad.legacy_urls");

import("etherpad.control.aboutcontrol");
import("etherpad.control.admincontrol");
import("etherpad.control.channelcontrol");
import("etherpad.control.connection_diagnostics_control");
import("etherpad.control.global_pro_account_control");
import("etherpad.control.historycontrol");
import("etherpad.control.loadtestcontrol");
import("etherpad.control.maincontrol");
import("etherpad.control.pad.pad_control");
import("etherpad.control.pro.pro_main_control");
import("etherpad.control.pro_signup_control");
import("etherpad.control.pro_help_control");
import("etherpad.control.static_control");
import("etherpad.control.testcontrol");

import("etherpad.pro.pro_pad_editors");
import("etherpad.pro.pro_utils");
import("etherpad.pro.pro_config");

import("etherpad.collab.collabroom_server");
import("etherpad.collab.collab_server");
import("etherpad.collab.readonly_server");
import("etherpad.collab.genimg");
import("etherpad.pad.model");
import("etherpad.pad.dbwriter");
import("etherpad.pad.noprowatcher");

jimport("java.lang.System.out.println");

/* DEADCODE?  

serverhandlers.startupHandler = function() {
  // Order matters.
  log.onStartup();
  statistics.onStartup();
//  model.onStartup();
  collab_server.onStartup();
  pad_control.onStartup();
  dbwriter.onStartup();
  importexport.onStartup();
  pro_pad_editors.onStartup();
  noprowatcher.onStartup();
  collabroom_server.onStartup();
};

serverhandlers.resetHandler = function() {
  statistics.onReset();
}

serverhandlers.shutdownHandler = function() {
  appjet.cache.shutdownHandlerIsRunning = true;

  log.callCatchingExceptions(writeSessionsToDisk);
  log.callCatchingExceptions(dbwriter.onShutdown);
  log.callCatchingExceptions(pro_pad_editors.onShutdown);
};
*/

//----------------------------------------------------------------
// request handling
//----------------------------------------------------------------

serverhandlers.requestHandler = function() {
  checkRequestIsWellFormed();
  sessions.preRequestCookieCheck();
  checkHost();
  checkHTTPS();
  handlePath();
};

// In theory, this should never get called.
// Exceptions that are thrown in frontend etherpad javascript should
//   always be caught and treated specially.
// If serverhandlers.errorHandler gets called, then it's a bug in the frontend.

/*  DEADCODE?

serverhandlers.errorHandler = function(ex) {
  logException(ex);
  response.setStatusCode(500);
  if (request.isDefined) {
    render500(ex);
  } else {
    if (! isProduction()) {
      response.write(exceptionutils.getStackTracePlain(ex));
    } else {
      response.write(ex.getMessage());
    }
  }
};

serverhandlers.postRequestHandler = function() {
  logRequest();
};
*/

//----------------------------------------------------------------
// Scheduled tasks
//----------------------------------------------------------------

/*  DEADCODE?

serverhandlers.tasks.writePad = function(globalPadId) {
  dbwriter.taskWritePad(globalPadId);
};
serverhandlers.tasks.flushPad = function(globalPadId, reason) {
  dbwriter.taskFlushPad(globalPadId, reason);
};
serverhandlers.tasks.checkForStalePads = function() {
  dbwriter.taskCheckForStalePads();
};
serverhandlers.tasks.statisticsDailyUpdate = function() {
  //statistics.dailyUpdate();
};
serverhandlers.tasks.doSlowFileConversion = function(from, to, bytes, cont) {
  return importexport.doSlowFileConversion(from, to, bytes, cont);
};
serverhandlers.tasks.proPadmetaFlushEdits = function(domainId) {
  pro_pad_editors.flushEditsNow(domainId);
};
serverhandlers.tasks.noProWatcherCheckPad = function(globalPadId) {
  noprowatcher.checkPad(globalPadId);
};
serverhandlers.tasks.collabRoomDisconnectSocket = function(connectionId, socketId) {
  collabroom_server.disconnectDefunctSocket(connectionId, socketId);
};
*/

//----------------------------------------------------------------
// cometHandler()
//----------------------------------------------------------------

serverhandlers.cometHandler = function(op, id, data) {
  checkRequestIsWellFormed();
  if (!data) {
    // connect/disconnect message, notify all comet receivers
    collabroom_server.handleComet(op, id, data);
    return;
  }

  while (data[data.length-1] == '\u0000') {
    data = data.substr(0, data.length-1);
  }

  var wrapper;
  try {
    wrapper = fastJSON.parse(data);
  } catch (err) {
    try {
      // after removing \u0000 might have to add '}'
      wrapper = fastJSON.parse(data+'}');
    }
    catch (err) {
      log.custom("invalid-json", {data: data});
      throw err;
    }
  }
  if(wrapper.type == "COLLABROOM") {
    collabroom_server.handleComet(op, id, wrapper.data);
  } else {
    //println("incorrectly wrapped data: " + wrapper['type']);
  }
};

//----------------------------------------------------------------
// sarsHandler()
//----------------------------------------------------------------

/*  DEADCODE?

serverhandlers.sarsHandler = function(str) {
  str = String(str);
  println("sarsHandler: parsing JSON string (length="+str.length+")");
  var message = fastJSON.parse(str);
  println("dispatching SARS message of type "+message.type);
  if (message.type == "migrateDiagnosticRecords") {
    pad_control.recordMigratedDiagnosticInfo(message.records);
    return 'OK';
  }
  return 'UNKNOWN_MESSAGE_TYPE';
};
*/

function checkRequestIsWellFormed() {
  // We require the "host" field to be present.
  // This should always be true, as long as the protocl is HTTP/1.1
  // TODO: check (request.protocol != "HTTP/1.1")
  if (request.isDefined && !request.host) {
    response.setStatusCode(505);
    response.setContentType('text/plain');
    response.write('Protocol not supported.  HTTP/1.1 required.');
    response.stop();
  }
}

//----------------------------------------------------------------
// checkHost()
//----------------------------------------------------------------
function checkHost() {

  // Allow all domains.
  return;

  /* DEADCODE?

  // we require the domain to either be <superdomain> or a pro domain request.
  if (SUPERDOMAINS[request.domain]) {
    return;
  }
  if (pro_utils.isProDomainRequest()) {
    return;
  }

  // redirect to etherpad.com
  var newurl = "http://etherpad.com"+request.path;
  if (request.query) { newurl += "?"+request.query; }
  response.redirect(newurl);
  */
}

//----------------------------------------------------------------
// checkHTTPS()
//----------------------------------------------------------------

// Check for HTTPS
function checkHTTPS() {
  /* Open-source note: this function used to check the protocol and make
   * sure that pages that needed to be secure went over HTTPS, and pages
   * that didn't go over HTTP.  However, when we open-sourced the code,
   * we disabled HTTPS because we didn't want to ship the etherpad.com
   * private crypto keys. --aiba */
  return;


  /* DEADCODE?

  if (stringutils.startsWith(request.path, "/static+/")) { return; }

  if (sessions.getSession().disableHttps || request.params.disableHttps) {
    sessions.getSession().disableHttps = true;
    println("setting session diableHttps");
    return;
  }

  var _ports = {
    http: appjet.config.listenPort,
    https: appjet.config.listenSecurePort
  };
  var _defaultPorts = {
    http: 80,
    https: 443
  };
  var _requiredHttpsPrefixes = [
    '/ep/admin',      // pro and etherpad
    '/ep/account',    // pro only
    '/ep/pro-account' // etherpad.com only
  ];

  var httpsRequired = false;
  _requiredHttpsPrefixes.forEach(function(p) {
    if (stringutils.startsWith(request.path, p)) {
      httpsRequired = true;
    }
  });

  if (isProDomainRequest() && pro_config.getConfig().alwaysHttps) {
    httpsRequired = true;
  }

  if (httpsRequired && !request.isSSL) {
    _redirectToScheme("https");
  }
  if (!httpsRequired && request.isSSL) {
    _redirectToScheme("http");
  }

  function _redirectToScheme(scheme) {
    var url = scheme + "://";
    url += request.host.split(':')[0]; // server

    if (_ports[scheme] != _defaultPorts[scheme]) {
      url += ':'+_ports[scheme];
    }

    url += request.path;
    if (request.query) {
      url += "?"+request.query;
    }
    response.redirect(url);
  }

  */
}

//----------------------------------------------------------------
// dispatching
//----------------------------------------------------------------

function handlePath() {
  if (!isProduction()) {
    log.info("Request for path [" + request.path + "]");
  }

  // Default.  Can be overridden in case of static files.
  response.neverCache();

  // these paths are handled identically on all sites/subdomains.
  var commonDispatcher = new Dispatcher();
  commonDispatcher.addLocations([
//    ['/favicon.ico', forward(static_control)],
//    ['/robots.txt', forward(static_control)],
//    ['/crossdomain.xml', forward(static_control)],
    [PrefixMatcher('/static+/'), forward(static_control)],
    [PrefixMatcher('/ep/channel/'), forward(channelcontrol)],
    [PrefixMatcher('/ep/genimg/'), genimg.renderPath],
    [PrefixMatcher('/ep/pad/'), forward(pad_control)],
    [/^\/([^\/]+)$/, pad_control.render_pad],
    [DirMatcher('/ep/test/'), forward(testcontrol)],
    [DirMatcher('/ep/pro-help/'), forward(pro_help_control)]
  ]);

  var etherpadDotComDispatcher = new Dispatcher();
  etherpadDotComDispatcher.addLocations([
    ['/', maincontrol.render_main],
    [DirMatcher('/ep/pro-signup/'), forward(pro_signup_control)],
    [DirMatcher('/ep/about/'), forward(aboutcontrol)],
    [DirMatcher('/ep/admin/'), forward(admincontrol)],
    [DirMatcher('/ep/connection-diagnostics/'), forward(connection_diagnostics_control)],
    [DirMatcher('/ep/loadtest/'), forward(loadtestcontrol)],
    [DirMatcher('/ep/pro-account/'), forward(global_pro_account_control)],
    [/^\/ep\/pad\/history\/(\w+)\/(.*)$/, historycontrol.render_history],
    [PrefixMatcher('/ep/pad/slider/'), pad_control.render_slider],
    [PrefixMatcher('/ep/'), forward(maincontrol)]
  ]);

  var proDispatcher = new Dispatcher();
  proDispatcher.addLocations([
    ['/', pro_main_control.render_main],
    [PrefixMatcher('/ep/'), forward(pro_main_control)],
  ]);

  // dispatching logic: first try common, then dispatch to
  // etherpad.com or pro.

  if (commonDispatcher.dispatch()) {
    return;
  }

  // Check if there is a pro domain associated with this request.
  if (isProDomainRequest()) {
    pro_utils.preDispatchAccountCheck();
    if (proDispatcher.dispatch()) {
      return;
    }
  } else {
    if (etherpadDotComDispatcher.dispatch()) {
      return;
    }
  }

  if (!isProDomainRequest()) {
    legacy_urls.checkPath();
  }

  render404();
}

