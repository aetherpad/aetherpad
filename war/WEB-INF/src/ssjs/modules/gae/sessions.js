
jimport("java.lang.System.out.println");
jimport("appjet.JSAdapter");

function getSession(opts) {
  opts = opts || {};
  var httpSession = request.session(true);

  var domain = (opts && opts.domain) ? opts.domain : "-";

  function getKey(attrName) {
    return [domain, attrName].join("$");
  }

  var a = {
    __put__: function(name, value) {
        //println("["+request.path+"] PUT SESSION<"+name+"> = "+value);

        var key = getKey(name);
        httpSession.setAttribute(key, value);
    },
    __get__: function(name) {
        var key = getKey(name);
        return httpSession.getAttribute(key);
    }
  };
  return new JSAdapter(a);
}


