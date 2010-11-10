
import("etherpad.testing.testutils.assertTruthy");
import("gae.memcache");
jimport("java.lang.System.out.println");

function run() {
  testBasicPutAndGet();
  testIncrement();
}

function testBasicPutAndGet() {
  memcache.put("a", 1);
  var r = memcache.get("a");
  assertTruthy(r == 1);
  return "OK";
}

function testIncrement() {
//  assertTruthy(memcache.increment("k", 
}


