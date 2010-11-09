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

import("stringutils.trim");
import("jsutils.scalaF0")

jimport("appjet.BetterFile.getReaderString");

function _cx() { return appjet.context };
function _req() { return _cx().request() };
function _toStringArray(obj) {
  if (obj instanceof Array) {
    return obj.map(String);
  }
  if (obj instanceof Packages.java.util.Enumeration) {
    var a = [];
    while (obj.hasMoreElements()) {
      a.push(String(obj.nextElement()));
    }
    return a;
  }
  throw new Error("toStringArray: Unknown object type "+obj);
}
function _enumeratorMap(object, keysFnName, valuesFnName) {
  return function() {
    var map = {};
    var keys = object[keysFnName]();
    while (keys.hasMoreElements()) {
      var key = keys.nextElement();
      map[key] = _toStringArray(object[valuesFnName](key));
      if (map[key].length == 1) {
        map[key] = map[key][0];
      }
    }
    return map;    
  }
}

function _addIfNotPresent(obj, key, value) {
  if (!(key in obj)) obj[key] = value;
}

var request = {

get isDefined() {
  return (
    _cx() != null && 
    _req() != null
  );
},

get cache() {
  if (_req().getAttribute("jsCache") == null) {
    _req().setAttribute("jsCache", {});
  }
  return _req().getAttribute("jsCache");
},

/**
 * The request path following the hostname.  For example, if the user
 * is visiting yourapp.appjet.net/foo, then this will be set to
 * "/foo".
 *
 * This does not include CGI parameters or the domain name, and always
 * begins with a "/".
 *
 * @type string
 */
get path() {
  if (this.isDefined) {
    return String(_req().getRequestURI());
  }
},

/**
 * The value request query string.
 *
 * For example, if the user visits "yourapp.appjet.net/foo?id=20", then
 * query will be "id=20".
 *
 * @type string
 */
get query() {
  if (this.isDefined) {
    if (_req().getQueryString() != null) {
      return String(_req().getQueryString());
    }
  }
},

/**
 * Either "GET" or "POST" (uppercase).
 * @type string
 */
get method() {
  if (this.isDefined) {
    return String(_req().getMethod().toUpperCase());
  }
},

/**
 * Whether the curent HTTP request is a GET request.
 * @type boolean
 */
get isGet() {
  return (this.method == "GET");
},

/**
 * Whether the current HTTP request is a POST request.
 * @type boolean
 */
get isPost() {
  return (this.method == "POST");
},

/**
 * Either "http" or "https" (lowercase).
 * @type string
 */
get scheme() {
  if (this.isDefined) {
    return String(_req().getScheme());
  }
},

/**
 * Whether the current request arrived using HTTPS.
 * @type boolean
 */
get isSSL() {
  return (this.scheme == "https");
},

/**
 * Holds the IP address of the user making the request.
 * @type string
 */
get clientAddr() {
  if (this.isDefined) {
    return String(_req().getRemoteAddr());
  }
},

/**
 * Parameters associated with the request, either from the query string
 * or from the contents of a POST, e.g. from a form.  Parameters are accessible
 * by name as properties of this object.  The property value is either a
 * string (typically) or an array of strings (if the parameter occurs
 * multiple times in the request).
 *
 * @type object
 */
get params() {
  if (this.isDefined) {
    return _cx().attributes().getOrElseUpdate("requestParams",
      scalaF0(_enumeratorMap(_req(), "getParameterNames", "getParameterValues")));
  }
},

/**
 * Used to access the HTTP headers of the current request.  Properties are
 * header names, and each value is either a string (typically) or an
 * array of strings (if the header occurs multiple times in the request).
 *
 * @example
print(request.headers["User-Agent"]);
 *
 * @type object
 */
get headers() {
  if (this.isDefined) {
    return _cx().attributes().getOrElseUpdate("requestHeaders",
      scalaF0(_enumeratorMap(_req(), "getHeaderNames", "getHeaders")));
  }
},

// TODO: this is super inefficient to do each time someone accesses
// request.cookies.foo.  We should probably store _cookies in the requestCache.
get cookies() {
  if (this.isDefined) {
    var reqHeaders = this.headers;
    return _cx().attributes().getOrElseUpdate("requestCookies",
      scalaF0(function() {
        var cookies = {};
        var cookieHeaderArray = reqHeaders['Cookie'];
        if (!cookieHeaderArray) { return {}; }
        if (!(cookieHeaderArray instanceof Array))
          cookieHeaderArray = [cookieHeaderArray];
        var name, val;

        cookieHeaderArray.forEach(function (cookieHeader) {
          cookieHeader.split(';').forEach(function(cs) {
            var parts = cs.split('=');
            if (parts.length == 2) {
              name = trim(parts[0]);
              val = trim(unescape(parts[1]));
              _addIfNotPresent(cookies, name, val);
            }
          });
        });

        return cookies;
      }));
  }
},

get session() {
  return function(create) {
    return _req().getSession(create ? true : false);
  };
},

/**
 * Holds the full URL of the request.
 */
get url() {
  if (this.isDefined) { 
    return this.scheme+"://"+this.host+this.path+(this.query ? "?"+this.query : "");
  }
},

get host() {
  if (this.isDefined) {
    // required by HTTP/1.1 to be present.
    return String(this.headers['Host']).toLowerCase();
  }
},

get domain() {
  if (this.isDefined) {
    // like host, but without the port if there is one.
    return this.host.split(':')[0];
  }
},

get uniqueId() {
  return String(_cx().executionId());
},

get userAgent() {
  if (this.isDefined) {
    var agentString = (request.headers['User-Agent'] || "?");
    return {
      toString: function() { return agentString; },
      isIPhone: function() { return (agentString.indexOf("(iPhone;") > 0); }
    };
  }
},

get acceptsGzip() {
  if (this.isDefined) {
    var headerArray = this.headers["Accept-Encoding"];
    if (! (headerArray instanceof Array)) {
            headerArray = [headerArray];
    }
    // Want to see if some accept-encoding header OK's gzip.
    // Starting with: "Accept-Encoding: gzip; q=0.5, deflate; q=1.0"
    // 1. Split into ["gzip; q=0.5", "delfate; q=1.0"]
    // 2. See if some entry is gzip with q > 0. (q is optional.)
    return headerArray.some(function(header) {
      if (! header) return false;
      return header.split(/,\s*/).some(function(validEncoding) {
          if (!validEncoding.indexOf("gzip") == 0) {
              return false;
          }
          if (/q=[0\.]*$/.test(validEncoding)) {
              return false;
          }
          return true;
      });
    });
  }
},

get underlying() {
  if (this.isDefined) {
    return _req();
  }
},

get bodyString() {
  return getReaderString(_req().getReader());
}

}; // end: var request = {...
