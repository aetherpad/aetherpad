package appjet;

import scala.collection.mutable.HashMap;

import org.mozilla.javascript.Scriptable

object ScopeManager {
  val mainGlobalRhinoScope = BodyLock.newScope;
  
  var cachedScope: Option[Scope] = None;

  // these had better exist!
  def preamble = Libraries.get("WEB-INF/src/ssjs/preamble.js");
  def main = Libraries.get("WEB-INF/src/ssjs/main.js");
  def postamble = Libraries.get("WEB-INF/src/ssjs/postamble.js");
  
  def withScope(block: Scope => Unit) = synchronized {
    try {
      if (cachedScope.isEmpty) {
        cachedScope = Some(new Scope(
          BodyLock.subScope(mainGlobalRhinoScope),
          scope => ScopeManager.main.executable.get.execute(scope)));
      }
      block(cachedScope.get);      
    } finally {
      Libraries.reset();
      cachedScope = None;
    }
  }

  def withTransientScope[E](init: Scriptable => Unit, main: Scope => E): E = {
    val scope = new Scope(BodyLock.subScope(mainGlobalRhinoScope), init);
    main(scope);
  }
}

class Scope(val parentRhinoScope: Scriptable, init: Scriptable => Unit) {
  val mainRhinoScope = BodyLock.subScope(parentRhinoScope);
  val attributes = new HashMap[String, Object];
  
  ExecutionContextUtils.withContext(ExecutionContext(null, null, this)) {
    ScopeManager.preamble.executable.get.execute(parentRhinoScope);
    init(mainRhinoScope);
    ScopeManager.postamble.executable.get.execute(parentRhinoScope);
  }
}
