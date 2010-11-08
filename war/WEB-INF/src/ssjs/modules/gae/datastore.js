jimport("appjet.datastore");
jimport("com.google.appengine.api.datastore.DatastoreServiceFactory");
jimport("com.google.appengine.api.datastore.Entity");
jimport("com.google.appengine.api.datastore.EntityNotFoundException");
jimport("com.google.appengine.api.datastore.Key");
jimport("com.google.appengine.api.datastore.KeyFactory");

import("jsutils.scalaF0")

function getDatastoreService() {
  if (! appjet.requestCache.datastoreService) {
    appjet.requestCache.datastoreService =
      DatastoreServiceFactory.getDatastoreService();
  }
  return appjet.requestCache.datastoreService;
}

/**
 * This might be a little funky. Semantics on when a transaction
 * is automatically rolled back are murky.
 */
function inTransaction(parentKey, func) {
  return datastore.inTransaction(getDatastoreService(), parentKey, scalaF0(func));
}

function getCurrentTransaction() {
  var txn = getDatastoreService().getCurrentTransaction(null);
  if (txn) {
    return { underlying: txn, other: datastore.currentUserData() }
  }
}

//----------------------------------------------------------------
// For storing and retreiving misc strings
//----------------------------------------------------------------

var MISC_KIND = "misc";
var MISC_STR_PROP = "x";

// Returns null if not found.
function getMiscString(keyString) {
  var ds = getDatastoreService();
  var key = KeyFactory.createKey(MISC_KIND, keyString);
  try {
    var ent = ds.get(key);
    return ent.getProperty(MISC_STR_PROP);
  } catch (e) {
    if (e.javaException instanceof EntityNotFoundException) {
      return null;
    }
    throw e;
  }
}

function setMiscString(keyString, valString) {
  var ds = getDatastoreService();
  var key = KeyFactory.createKey(MISC_KIND, keyString);
  var ent = new Entity(key);
  ent.setProperty(MISC_STR_PROP, valString);
  ds.put(ent);
}


