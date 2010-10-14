jimport("appjet.datastore");
jimport("com.google.appengine.api.datastore.DatastoreServiceFactory");

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