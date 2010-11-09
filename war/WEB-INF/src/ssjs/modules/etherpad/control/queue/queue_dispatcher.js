
import("fastJSON");

import("etherpad.control.queue.test_queue");

jimport("java.lang.System.out.println");

function onRequest(name) {
  var args = fastJSON.parse(request.bodyString);
  if (name == "test") {
    test_queue.execute(args);
    return true;
  } else {
    return false;
  }
}


