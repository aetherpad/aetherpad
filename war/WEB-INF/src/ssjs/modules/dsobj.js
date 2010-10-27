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

import("cache_utils.syncedWithCache");
import("jsutils.*");
import("datastore");

jimport("java.lang.System.out.println");
jimport("com.google.appengine.api.datastore.Entity");
jimport("com.google.appengine.api.datastore.FetchOptions");
jimport("com.google.appengine.api.datastore.Key");
jimport("com.google.appengine.api.datastore.KeyFactory");
jimport("com.google.appengine.api.datastore.Query");

function _withCache(name, fn) {
  return syncedWithCache('sqlobj.'+name, fn);
}

function _getDatastoreValue(v) {
  if (v.valueOf && v.getDate && v.getHours) {
    return new java.util.Date(+v);
  } else {
    return v;
  }
}

function _currentParentKey() {
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  return parentKey;
}

function _entityToJsObj(entity) {
  var resultObj = {};
  var props = entity.getProperties().entrySet().iterator();
  while (props.hasNext()) {
    var entry = props.next();
    resultObj[entry.getKey()] = entry.getValue();
  }
  if (! resultObj.id) {
    var key = entity.getKey();
    if (key.getName()) {
      //var currentParent = (_currentParentKey() || null);
      //var keyParent = (key.getParent() || null);
      //if (currentParent == keyParent) {
      resultObj.id = key.getName();
      //}
    }
    if (! resultObj.id) {
      resultObj.id = key;
    }
  }
  //if ((! resultObj.parentName) && entity.getParent()
  //    && entity.getParent().getName()) {
  //  resultObj.parentName = entity.getParent().getName();
  //}
  return resultObj;
}

function _toKey(kind, id, parentKey) {
  if (id instanceof Key) {
    return id;
  }
  else if ((typeof id) == 'string') {
    return KeyFactory.createKey(parentKey, kind, id);
  }
  else {
    return id;
  }
}

/**
 * Converts a table name into a datastore kind
 */
function _getKind(tableName) {
  return "sqlobj."+tableName;
}

function _setEntityProperties(tableName, entity, obj) {
  keys(obj).forEach(function(k) {
//    if (! appjet.cache.sqlobj_tables ||
//        ! appjet.cache.sqlobj_tables[tableName] ||
//        appjet.cache.sqlobj_tables[tableName].indices[k]) {
    if (k != 'id') {
      entity.setProperty(k, _getDatastoreValue(obj[k]));
    }
//    } else {
//      entity.setUnindexedProperty(k, _getDatastoreValue(obj[k]));
//    }
  });
}

/*
 * Inserts the object into the given table, and returns auto-incremented ID if any.
 * Replaces existing obj with same 'id' property if there is one.
 */
function insert(tableName, obj) {
  var kind = _getKind(tableName);
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  var key = _toKey(kind, obj.id, parentKey);

  var entity = (key ? new Entity(key) :
                (parentKey ?
                 new Entity(kind, parentKey) :
                 new Entity(kind)));
  _setEntityProperties(tableName, entity, obj);

  return ds.put(txn, entity);
};

/*
 * Selects a single object given the constraintMap.  If there are more
 * than 1 objects that match, it will return a single one of them
 * (unspecified which one).  If no objects match, returns null.
 *
 * constraints is a javascript object of column names to values.
 *  Currently only supports string equality of constraints.
 */
function selectSingle(tableName, constraints) {
  var kind = _getKind(tableName);
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  var selectKey = _toKey(kind, constraints.id, parentKey);

  if (selectKey) {
    try {
      return _entityToJsObj(ds.get(txn, selectKey));
    } catch (e) {
      if (e.javaException instanceof com.google.appengine.api.datastore.EntityNotFoundException) {
        return null;
      }
      throw e;
    }
  }

  var query = new Query(kind, parentKey);
  keys(constraints).forEach(function(key) {
    query.addFilter(key, Query.FilterOperator.EQUAL, constraints[key]);
  });

  query = ds.prepare(txn, query);
  var i = query.asIterator(FetchOptions.Builder.withLimit(1));
  if (i.hasNext()) {
    return _entityToJsObj(i.next());
  } else {
    return null;
  }
}

function _getEntitiesForConstraints(tableName, constraints, options) {
  if (!options) {
    options = {};
  }

  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;

  var query = new Query(_getKind(tableName), parentKey);
  keys(constraints).forEach(function(key) {
    query.addFilter(key, Query.FilterOperator.EQUAL, constraints[key]);
  });

  if (options.orderBy) {
    options.orderBy.split(",").forEach(function(orderBy) {
      var direction = Query.SortDirection.ASCENDING;
      if (orderBy.charAt(0) == '-') {
        orderBy = orderBy.substr(1);
        direction = Query.SortDirection.DESCENDING;
      }
      query.addSort(orderBy, direction);
    });
  }

  if (options.keysOnly) {
    query.setKeysOnly();
  }

  query = ds.prepare(txn, query);
  var fetchOptions = FetchOptions.Builder.withDefaults();

  if (options.limit) {
    fetchOptions.limit(options.limit);
  }

  var results = query.asIterator(fetchOptions);
  var resultArray = [];
  while (results.hasNext()) {
    resultArray.push(results.next());
  }

  return resultArray;
}

function selectMulti(tableName, constraints, options) {
  return _getEntitiesForConstraints(tableName, constraints, options).map(
    _entityToJsObj);
}

/* returns number of rows updated */
function update(tableName, constraints, obj) {
  var kind = _getKind(tableName);
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  var updateKey = _toKey(kind, constraints.id, parentKey);

  if (updateKey) {
    // this isn't a constrained update, it's a single-object update.
    try {
      // note that obj.id is ignored; we don't allow changing id via update
      var entity = ds.get(txn, updateKey);
      _setEntityProperties(tableName, entity, obj);
      ds.put(txn, entity);
      return 1;
    } catch (e) {
      if (e.javaException instanceof com.google.appengine.api.datastore.EntityNotFoundException) {
        return 0;
      }
      throw e;
    }
  }

  var matchingEntities = _getEntitiesForConstraints(tableName, constraints);
  matchingEntities.forEach(function(entity) {
    _setEntityProperties(tableName, entity, obj);
    ds.put(txn, entity);
  });
  return matchingEntities.length;
}

function updateSingle(tableName, constraints, obj) {
  var count = update(tableName, constraints, obj);
  if (count > 1) {
    throw Error("save count > 1.  instead, count = "+count);
  }
}

function deleteRows(tableName, constraints) {
  var kind = _getKind(tableName);
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  var deleteKey = _toKey(kind, constraints.id, parentKey);

  if (deleteKey) {
    // single-key delete
    ds["delete"](txn, deleteKey);
    return;
  }

  var matchingEntities =
    _getEntitiesForConstraints(tableName, constraints, {keysOnly: true});
  ds["delete"](txn, new java.lang.Iterable({
    iterator: function() { return java.lang.Iterator({
      pos: 0,
      hasNext: function() { return this.pos < matchingEntities.length; },
      next: function() { return matchingEntities[this.pos++].getKey(); }
    })}
  }));
}

//----------------------------------------------------------------
// table management
//----------------------------------------------------------------

/*
 * Create a SQL table, specifying column names and types with a
 * javascript object.
 */
/*
function createTable(tableName, colspec, indices) {
  if (! appjet.cache.sqlobj_tables) {
    appjet.cache.sqlobj_tables = {};
  }
  var _tables = appjet.cache.sqlobj_tables;
  if (_tables[tableName]) {
    return;
  }
  _tables[tableName] = { keys: colspec, indices: indices };
  //
  // var stmnt = "CREATE TABLE "+_bq(tableName)+ " (";
  // stmnt += keys(colspec).map(function(k) { return (_bq(k) + ' ' + colspec[k]); }).join(', ');
  // if (indices) {
  //   stmnt += ', ' + keys(indices).map(function(k) { return 'INDEX (' + _bq(k) + ')'; }).join(', ');
  // }
  // stmnt += ')'+createTableOptions();
  // _execute(stmnt);
}
*/

