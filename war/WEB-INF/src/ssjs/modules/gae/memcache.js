// Easy wrapper for memcache Java library.
//

jimport("com.google.appengine.api.memcache.ErrorHandler");
jimport("com.google.appengine.api.memcache.Expiration");
jimport("com.google.appengine.api.memcache.MemcacheService");
jimport("com.google.appengine.api.memcache.MemcacheService.SetPolicy.ADD_ONLY_IF_NOT_PRESENT");
jimport("com.google.appengine.api.memcache.MemcacheService.SetPolicy.REPLACE_ONLY_IF_PRESENT");
jimport("com.google.appengine.api.memcache.MemcacheService.SetPolicy.SET_ALWAYS");
jimport("com.google.appengine.api.memcache.MemcacheServiceFactory");

jimport("com.google.appengine.api.NamespaceManager");
jimport("com.google.appengine.api.memcache.MemcacheServicePb.MemcacheGetRequest");
jimport("com.google.appengine.api.memcache.MemcacheServicePb.MemcacheGetResponse");
jimport("com.google.appengine.api.memcache.MemcacheServicePb.MemcacheSetRequest");
jimport("com.google.appengine.api.memcache.MemcacheServicePb.MemcacheSetResponse");
jimport("com.google.appengine.api.memcache.MemcacheSerialization");
jimport("com.google.apphosting.api.ApiProxy");
jimport("com.google.appengine.repackaged.com.google.protobuf.ByteString");


function ns(namespace) {
  if (namespace) {
    return _wrapService(MemcacheServiceFactory.getMemcacheService(namespace));
  } else {
    return _wrapService(MemcacheServiceFactory.getMemcacheService());
  }
}

var _proto = {
  get: function(key) {
    return this._srv.get(key);
  },
  increment: function(key, delta, init) {
    if (init === undefined) {
      return this._srv.increment(key, Number(delta));
    } else {
      return this._srv.increment(key, Number(delta), Number(init));
    }
  },
  putWithPolicy: function(key, value, policy) {
    return this._srv.put(key, value, null, policy);
  },
  putOnlyIfNotPresent: function(key, value) {
    return this.putWithPolicy(key, value, ADD_ONLY_IF_NOT_PRESENT);
  },
  put: function put(key, value) {
    return this.putWithPolicy(key, value, SET_ALWAYS);
  },
  remove: function(key) {
    return this._srv['delete'](key);
  },
  getIdentifiable: function(key) {
    // ported from MemcacheServiceImpl
    var reqBuilder = MemcacheGetRequest.newBuilder();
    reqBuilder.setNameSpace(_getEffectiveNamespace(this._srv));
    reqBuilder.addKey(ByteString.copyFrom(MemcacheSerialization.makePbKey(key)));
    reqBuilder.setForCas(true);
    var req = reqBuilder.build();

    var responseBytes =
      ApiProxy.makeSyncCall("memcache", "Get", req.toByteArray());
    var res = MemcacheGetResponse.newBuilder();
    res.mergeFrom(responseBytes);

    if (res.getItemCount() < 1) {
      return null;
    }
    else {
      var item = res.getItem(0);
      var value = MemcacheSerialization.deserialize(item.getValue().toByteArray(),
						    item.getFlags());
      return {cas: java.lang.Long.valueOf(item.getCasId()).toString(), value:value};
    }
  },
  putIfUntouched: function(key, oldCasAndValue, newValue, expiration) {
    // ported from MemcacheServiceImpl
    var reqBuilder = MemcacheSetRequest.newBuilder();
    reqBuilder.setNameSpace(_getEffectiveNamespace(this._srv));
    var itemBuilder = MemcacheSetRequest.Item.newBuilder();
    var valueAndFlags = MemcacheSerialization.serialize(newValue);
    itemBuilder.setValue(ByteString.copyFrom(valueAndFlags.value));
    itemBuilder.setFlags(valueAndFlags.flags.ordinal());
    itemBuilder.setKey(ByteString.copyFrom(MemcacheSerialization.makePbKey(key)));
    itemBuilder.setExpirationTime(expiration ? expiration.getSecondsValue() : 0);
    itemBuilder.setSetPolicy(MemcacheSetRequest.SetPolicy.CAS);
    itemBuilder.setCasId(java.lang.Long.parseLong(oldCasAndValue.cas));
    itemBuilder.setForCas(true);
    reqBuilder.addItem(itemBuilder);
    var req = reqBuilder.build();

    var responseBytes =
      ApiProxy.makeSyncCall("memcache", "Set", req.toByteArray());
    var res = MemcacheSetResponse.newBuilder();
    res.mergeFrom(responseBytes);
    var status = res.getSetStatus(0);
    if (status == MemcacheSetResponse.SetStatusCode.ERROR) {
      throw new Error();
    }
    return (status == MemcacheSetResponse.SetStatusCode.STORED);
  },
  performAtomic: function(key, func, initialValue) {
    var complete = false;
    var tries = 0;
    var newValue;
    while (! complete) {
      if (tries >= 5) {
	throw new java.lang.RuntimeException("Too much memcache contention.");
      }
      var iv = this.getIdentifiable(key);
      if (iv === null) {
	this.putOnlyIfNotPresent(key, initialValue);
      }
      else {
	newValue = func(iv.value);
	complete = this.putIfUntouched(key, iv, newValue);
	tries++;
      }
    }
    return newValue;
  }
};



function _wrapService(srv) {
  function F() {}
  F.prototype = _proto;
  var mc = new F();
  mc._srv = srv;
  return mc;
}

// ported from MemcacheServiceImpl
function _getEffectiveNamespace(srv) {
  return srv.getNamespace() || NamespaceManager.get() || "";
}

// clears all entries in all namespaces
function CLEAR_ALL() {
  ns()._srv.clearAll();
}