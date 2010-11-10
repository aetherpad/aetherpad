
import("etherpad.testing.testutils.assertTruthy");
import("etherpad.testing.testutils.assertEqual");
import("gae.memcache");
jimport("java.lang.System.out.println");

function run() {
  testBasicPutAndGet();
  testIncrement();
}

function testBasicPutAndGet() {
  memcache.remove("a");
  memcache.put("a", 1);
  var r = memcache.get("a");
  assertTruthy(r == 1);
  return "OK";
}

function testIncrement() {
  memcache.remove("k");
  assertEqual(memcache.increment("k", 1), null);
  for (var i = 0; i < 100; i++) {
    assertEqual(memcache.increment("k", 1, 0), i+1);
  }
}


