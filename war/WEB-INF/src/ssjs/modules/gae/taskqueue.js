
import("fastJSON");

jimport("com.google.appengine.api.labs.taskqueue.Queue");
jimport("com.google.appengine.api.labs.taskqueue.QueueFactory");
jimport("com.google.appengine.api.labs.taskqueue.TaskOptions.Method.POST");
jimport("com.google.appengine.api.labs.taskqueue.TaskOptions.Builder.method");
jimport("com.google.appengine.api.labs.taskqueue.TaskOptions.Builder.payload");
jimport("com.google.appengine.api.labs.taskqueue.TaskOptions.Builder.taskName");
jimport("com.google.appengine.api.labs.taskqueue.TaskOptions");

// will POST to /_ah/<queueName>/<taskName
function schedule(queueName, taskName, payloadObj) {
  var q = QueueFactory.getQueue(queueName);
  var json = fastJSON.stringify(payloadObj);
  var bytes = (new java.lang.String(json)).getBytes("UTF-8");
  q.add(
      method(POST).
      taskName(taskName).
      payload(bytes, "application/json"));
}


