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

/**
 * This isn't reqlly "SQL" anymore, it's now backed by the AppEngine datastore.
 */
import("jsutils.*");
import("fastJSON");
import("timer");
import("gae.datastore");

jimport("java.lang.System.out.println");

jimport("com.google.appengine.api.datastore.Entity");
jimport("com.google.appengine.api.datastore.FetchOptions");
jimport("com.google.appengine.api.datastore.KeyFactory");
jimport("com.google.appengine.api.datastore.Query");
jimport("com.google.appengine.api.datastore.Text");

function _getKind(tableName) {
  return "sqlbase."+tableName;
}

function _makeDatastoreKey(parentKey, tableName, stringKey) {
  return KeyFactory.createKey(parentKey || null, _getKind(tableName), stringKey);
}

/**
 * Retrieves a JavaScript object or value from a table.  Returns undefined
 * if there is no mapping for the given string key.  Requires that the table
 * exist.
 */
function getJSON(tableName, stringKey) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  try {
    var result = ds.get(txn, _makeDatastoreKey(parentKey, tableName, stringKey));
    if (result) {
      return fastJSON.parse(String(result.getProperty("json").getValue()))['x'];
    }
  } catch (e) {
    if (!(e.javaException instanceof
          com.google.appengine.api.datastore.EntityNotFoundException)) {
      throw e;
    }
  }
  return undefined;
}

function getAllJSON(tableName, start, count) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var query = new Query(_getKind(tableName), parentKey);
  var i = ds.prepare(txn, query).asIterator(
    FetchOptions.Builder.withOffset(start).limit(count));

  var results = [];
  if (i) {
    while (i.hasNext()) {
      var next = i.next();
      results.push({
        id: next.getKey().getName(),
        value: fastJSON.parse(String(next.getProperty("json").getValue()))['x']
      });
    }
  }
  return results;
}

function getAllJSONKeys(tableName) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var query = (new Query(_getKind(tableName), parentKey)).setKeysOnly(true);
  var i = ds.prepare(txn, query).asIterator();

  var results = [];
  if (i) {
    while (i.hasNext()) {
      results.push(i.next().getKey().getName());
    }
  }
  return results;
}

/**
 * Assigns a JavaScript object or primitive value to a string key in a table.
 * Maximum key length is 128 characters. Requires that the table exist.
 */
function putJSON(tableName, stringKey, objectOrValue) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var obj = ({x:objectOrValue});
  var json = fastJSON.stringify(obj);
  var entity = new Entity(_getKind(tableName), stringKey, parentKey);

  // Don't index the json, duh.
  entity.setUnindexedProperty("json", new Text(json));

  ds.put(txn, entity);
}

/**
 * Removes the mapping for a string key from a table.  Requires that the table
 * exist.
 */
function deleteJSON(tableName, stringKey) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  ds["delete"](txn, _makeDatastoreKey(parentKey, tableName, stringKey));
}

function _generateStringArrayKey(parentKey, tableName, stringKey, n) {
  var stringName = stringKey + "/" + n;
  return _makeDatastoreKey(parentKey, tableName, stringName);
}

/**
 * Assigns a string value to a (key,n) pair in a StringArray table.  Maximum key length
 * is 128 characters.  Requires that the table exist.
 */
function putStringArrayElement(tableName, stringKey, n, value) {
  putConsecutiveStringArrayElements(tableName, stringKey, n, [value]);
}

/**
 * Equivalent to a series of consecutive puts of the elements of valueArray, with the first
 * one going to n=startN, the second to n=startN+1, and so on, but much more efficient.
 */
function putConsecutiveStringArrayElements(tableName, stringKey, startN, valueArray) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  for (var i = 0; i < valueArray.length; ++i) {
    var entity = new Entity(_generateStringArrayKey(parentKey, tableName, stringKey, startN+i))
    entity.setUnindexedProperty("value", String(valueArray[i]));
    ds.put(txn, entity);
  }
}

/**
 * Equivalent to a series of puts of the (key,value) entries of the JavaScript object
 * nToValue, using as few database operations as possible.
 */
function putDictStringArrayElements(tableName, stringKey, nToValue) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var nArray = [];
  for(var n in nToValue) {
    nArray.push(n);
  }
  nArray.sort(function(a,b) { return Number(a) - Number(b); });

  nArray.forEach(function(n) {
    var entity = new Entity(_generateStringArrayKey(parentKey, tableName, stringKey, n))
    entity.setUnindexedProperty("value", String(nToValue[n]));
    ds.put(txn, entity);
  });
}

/**
 * Retrieves a string value from a StringArray table.  Returns undefined
 * if there is no mapping for the given (key,n) pair.  Requires that the table
 * exist.
 */
function getStringArrayElement(tableName, stringKey, n) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  try {
    var result = ds.get(txn,
                        _generateStringArrayKey(parentKey, tableName, stringKey, n));
    if (result && result.getProperty("value")) {
      return String(result.getProperty("value"));
    }
  } catch (e) {
    if (!(e.javaException instanceof
          com.google.appengine.api.datastore.EntityNotFoundException)) {
      throw e;
    }
  }
  return undefined;
}

/**
 * Retrieves all values from the database page that contains the mapping for n.
 * Properties are added to destMap for n, if present in the database, and any other
 * numeric entries in the same page.  No return value.
 */
function getPageStringArrayElements(tableName, stringKey, n, destMap) {
  destMap[n] = getStringArrayElement(tableName, stringKey, n);
}

/**
 * Removes the mapping for a (key,n) pair from a StringArray table.  Requires that the table
 * exist.
 */
function deleteStringArrayElement(tableName, stringKey, n) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  ds["delete"](txn, _generateStringArrayKey(parentKey, tableName, stringKey, n));
}

/**
 * Removes all mappings and metadata associated with a given key in a table.
 */
function clearStringArray(tableName, stringKey) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var query = new Query(_getKind(tableName), parentKey);
  var keyString = _makeDatastoreKey(parentKey, tableName, stringKey).toString;
  query.addFilter("__key__", Query.FilterOperator.GREATER_THAN_OR_EQUAL, keyString);
  query.addFilter("__key__", Query.FilterOperator.LESS_THAN_OR_EQUAL, keyString+"\ufffd");
  query.setKeysOnly();
  query = ds.prepare(transaction, query);

  ds["delete"](txn, new java.lang.Iterable({
    iterator: function() { return new java.lang.Iterator({
      underlying: query.asIterator(),
      hasNext: function() { return this.underlying.hasNext(); },
      next: function() { return this.underlying.next().getKey(); }
    })}
  }));
}

// function getStringArrayAllKeys(tableName) {
//   var result = _sqlbase().getStringArrayAllKeys(String(tableName));
//   return Array.prototype.map.call(result, function(x) { return String(x); });
// }
