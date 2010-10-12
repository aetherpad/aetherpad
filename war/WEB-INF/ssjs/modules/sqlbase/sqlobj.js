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
import("sqlbase.sqlcommon.*");
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

function getIdColspec() {
  return ('INT NOT NULL '+autoIncrementClause()+' PRIMARY KEY');
}

function getLongtextColspec(extra) {
  var spec = getSqlBase().longTextType();
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function getBoolColspec(extra) {
  var spec;
  if (isMysql()) {
    spec = 'TINYINT(1)';
  } else {
    spec = 'SMALLINT';
  }
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function getDateColspec(extra) {
  var spec;
  if (isMysql()) {
    spec = 'DATETIME';
  } else {
    spec = 'TIMESTAMP';
  }
  if (extra) {
    spec = (spec + " " + extra);
  }
  return spec;
}

function _bq(x) { return btquote(x); }

/*
 * for debugging queries
 */
function _qdebug(q) {
  if (appjet.config.debugSQL) {
    println(q);
  }
}

/** executeFn is either "execute" or "executeUpdate" "executeQuery" */
function _execute(stmnt, executeFn) {
  if (!executeFn) {
    executeFn = 'execute';
  }
  return withConnection(function(conn) {
    var pstmnt = conn.prepareStatement(stmnt);
    return closing(pstmnt, function() {
      _qdebug(stmnt);
      return pstmnt[executeFn]();
    });
  });
}

function _executeUpdate(stmnt) {
  return _execute(stmnt, 'executeUpdate');
}

function _executeQuery(stmnt) {
  return _execute(stmnt, 'executeQuery');
}

/*
 * Not all SQL/JS types supported.
 */
function _getJsValFromResultSet(rs, type, colName) {
  var r;
  if (type == java.sql.Types.VARCHAR ||
      type == java.sql.Types.LONGVARCHAR ||
      type == java.sql.Types.CHAR) {
    r = String(rs.getString(colName));
  } else if (type == java.sql.Types.TIMESTAMP) {
    var t = rs.getTimestamp(colName);
    if (t) {
      r = new Date(t.getTime());
    } else {
      r = null;
    }
  } else if (type == java.sql.Types.INTEGER ||
             type == java.sql.Types.SMALLINT ||
             type == java.sql.Types.TINYINT) {
    r = rs.getInt(colName);
  } else if (type == java.sql.Types.BIT) {
    r = rs.getBoolean(colName);
  } else {
    throw Error("Cannot fetch sql type ID "+type+" (columnName = "+colName+")");
  }

  if (rs.wasNull()) {
    r = null;
  }
  return r;
}

function _lookupColumnType(tableName, columnName) {
  return withConnection(function(conn) {
    var metadata = conn.getMetaData();
    var rs = metadata.getColumns(null, null, tableName, columnName);
    if (!rs) {
      throw Error("Table '"+tableName+"' does not appear to have colum '"+columnName+"'.");
    }
    var rsmd = rs.getMetaData();
    var colCount = rsmd.getColumnCount();
//    rs.first();
    rs.next();
    var type = rs.getInt("DATA_TYPE");
    return type;
  });
}

/* cached, on misses calls _lookuParameterType */
function _getParameterType(tableName, columnName) {
  var key = [tableName, columnName].join(".");
  return _withCache('column-types', function(cache) {
    if (!cache[key]) {
      cache[key] = _lookupColumnType(tableName, columnName);
    }
    return cache[key];
  });
}

/*
 * Not all SQL/JS types supported.
 */
function _setPreparedValues(tableName, pstmnt, keyList, obj, indexOffset) {
  if (!indexOffset) { indexOffset = 0; }

  for (var i = 1; i <= keyList.length; i++) {
    var k = keyList[i-1];
    var v = obj[k];
    var j = i + indexOffset;

    if (v === undefined) {
      throw Error("value is undefined for key "+k);
    }

    if (v === null) {
      var type = _getParameterType(tableName, k);
      pstmnt.setNull(j, type);
    } else if (typeof(v) == 'string') {
      pstmnt.setString(j, v);
    } else if (typeof(v) == 'number') {
      pstmnt.setInt(j, v);
    } else if (typeof(v) == 'boolean') {
      pstmnt.setBoolean(j, v);
    } else if (v.valueOf && v.getDate && v.getHours) {
      pstmnt.setTimestamp(j, new java.sql.Timestamp(+v));
    } else {
      throw Error("Cannot insert this type of javascript object: "+typeof(v)+" (key="+k+", value = "+v+")");
    }
  }
}

function _getDatastoreValue(v) {
  if (v.valueOf && v.getDate && v.getHours) {
    return new java.util.Date(+v);
  } else {
    return v;
  }
}

function _resultRowToJsObj(resultSet) {
  var resultObj = {};

  var metaData = resultSet.getMetaData();
  var colCount = metaData.getColumnCount();
  for (var i = 1; i <= colCount; i++) {
    var colName = metaData.getColumnName(i);
    var type = metaData.getColumnType(i);
    resultObj[colName] = _getJsValFromResultSet(resultSet, type, colName);
  }

  return resultObj;
}

function _entityToJsObj(entity) {
  var resultObj = {};
  var props = entity.getProperties().entrySet().iterator();
  while (props.hasNext()) {
    var entry = props.next();
    resultObj[entry.getKey()] = entry.getValue();
  }
  if (! resultObj.id) {
    resultObj.id = entity.getKey();
  }
  return resultObj;
}

/**
 * Converts a table name into a datastore kind
 */
function _getKind(tableName) {
  return "sqlobj."+tableName;
}

function _setEntityProperties(tableName, entity, obj) {
  keys(obj).forEach(function(k) {
    if (! appjet.cache.sqlobj_tables ||
        ! appjet.cache.sqlobj_tables[tableName] ||
        appjet.cache.sqlobj_tables[tableName].indices[k]) {
      entity.setProperty(k, _getDatastoreValue(obj[k]));
    } else {
      entity.setUnindexedProperty(k, _getDatastoreValue(obj[k]));
    }
  });
}

/*
 * Inserts the object into the given table, and returns auto-incremented ID if any.
 */
function insert(tableName, obj) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  
  var entity = (parentKey ?
    new Entity(_getKind(tableName), parentKey) :
    new Entity(_getKind(tableName)));
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
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  
  if (constraints.id instanceof Key) {
    try {
      return _entityToJsObj(ds.get(transaction, constraints.id));
    } catch (e) {
      if (e.javaException instanceof com.google.appengine.api.datastore.EntityNotFoundException) {
        return undefined;
      }
      throw e;
    }
  }
  
  var query = new Query(_getKind(tableName), parentKey);
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
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;
  var parentKey = transaction ? transaction.other : null;
  
  if (constraints.id instanceof Key) {
    // this isn't a constrained update, it's a single-object update.
    try {
      var entity = ds.get(transaction, obj.id);
      _setEntityProperties(tableName, entity, obj);
      ds.put(transaction, entity);
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
  if (count != 1) {
    throw Error("save count != 1.  instead, count = "+count);
  }
}

function deleteRows(tableName, constraints) {
  var ds = datastore.getDatastoreService();
  var transaction = datastore.getCurrentTransaction() || null;
  var txn = transaction ? transaction.underlying : null;

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

