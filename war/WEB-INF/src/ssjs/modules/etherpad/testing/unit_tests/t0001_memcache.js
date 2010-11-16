
import("etherpad.testing.testutils.assertTruthy");
import("etherpad.testing.testutils.assertEqual");
import("gae.memcache");
jimport("java.lang.System.out.println");

function run() {
  testBasicPutAndGet();
  testIncrement();
  testIdentifiable1();
  testIdentifiable2();
}

function _memcache() {
  return memcache.ns("test");
}

function testBasicPutAndGet() {
  var mc = _memcache();
  mc.remove("a");
  mc.put("a", 1);
  var r = mc.get("a");
  assertTruthy(r == 1);
  return "OK";
}

function testIncrement() {
  var mc = _memcache();
  mc.remove("k");
  assertEqual(mc.increment("k", 1), null);
  for (var i = 0; i < 100; i++) {
    assertEqual(mc.increment("k", 1, 0), i+1);
  }
}

function testIdentifiable1() {
  var mc = _memcache();
  mc.put("k", "v");
  var iv = mc.getIdentifiable("k");
  assertEqual(true,
	      mc.putIfUntouched("k", iv, iv.value+"z"));
  assertEqual("vz", mc.get("k"));
}

// requires real putIfUntouched support
function testIdentifiable2() {
  var mc = _memcache();
  mc.put("k", "v");
  var iv = mc.getIdentifiable("k");
  mc.put("k", "u");
  assertEqual(false,
	      mc.putIfUntouched("k", iv, iv.value+"z"));
}

