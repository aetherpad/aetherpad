
import("etherpad.testing.testutils.assertTruthy");
import("etherpad.testing.testutils.assertEqual");
import("gae.memcache");
jimport("java.lang.System.out.println");
import("etherpad.globals.isProduction");

function run() {
  testBasicPutAndGet();
  testIncrement();
  testIdentifiable1();
  if (isProduction()) {
    testIdentifiable2();
  }
  testPerformAtomic();
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

// doesn't actually test atomicity, just functionality
function testPerformAtomic() {
  var mc = _memcache();
  mc.put("k", "a");
  assertEqual("a", mc.get("k"));

  function twice(x) { return x+x; }

  mc.performAtomic("k", twice);
  assertEqual("aa", mc.get("k"));

  mc.performAtomic("k", twice);
  assertEqual("aaaa", mc.get("k"));

  mc.performAtomic("k", twice);
  assertEqual("aaaaaaaa", mc.get("k"));
}