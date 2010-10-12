package appjet;

import java.security.MessageDigest;

object md5 {
  def md5(input: String): String = {
    val bytes = input.getBytes("UTF-8");
    md5(bytes);
  }
  def md5(bytes: Array[Byte]): String = {
    var md = MessageDigest.getInstance("MD5");
    var digest = md.digest(bytes);
    var builder = new StringBuilder();
    for (b <- digest) {
      builder.append(Integer.toString((b >> 4) & 0xf, 16));
      builder.append(Integer.toString(b & 0xf, 16));
    }
    builder.toString();    
  }
}

object stringutils {
  def stringToHTML(str: String): String = {
    val result = new StringBuilder(str.length);
    var lastCharBlank = false;
    for(i <- 0 until str.length) {
      val c = str.charAt(i);
      if (c == ' ') {
        // every second consecutive space becomes a &nbsp;
        if (lastCharBlank) {
          lastCharBlank = false;
          result.append("&nbsp;");
        }
        else {
          lastCharBlank = true;
          result.append(' ');
        }
      } else {
        lastCharBlank = false;
        if (c == '&') result.append("&amp;");
        else if (c == '<') result.append("&lt;");
        else if (c == '>') result.append("&gt;");
        else if (c == '\n') result.append("<br/>\n");
        else if (c == '\t') {
          for(j <- 1 to 7) {
            result.append("&nbsp;");
          }
          result.append(' ');
        }
        else {
          val code = c.toInt;
          if (code < 127) {
            result.append(c);
          }
          else {
            // use character code
            result.append("&#");
            result.append(code);
            result.append(';');
          }
        }
      }
    }
    return result.toString;
  }
}

import com.google.appengine.api.datastore.DatastoreService;

object datastore {
  private val currentlyInTransaction = new NoninheritedDynamicVariable(false);
  private val userData = new NoninheritedDynamicVariable[Any](null);

  def currentUserData: Any = userData.value;
  
  def inTransaction[A](service: DatastoreService, userData_a: Any, block: => A): A = {
    if (currentlyInTransaction.value) {
      block;
    } else {
      currentlyInTransaction.withValue(true) { 
        userData.withValue(userData_a) {
          val transaction = service.beginTransaction();
          try {
            val result: A = block;
            transaction.commit();
            result;
          } catch {
            case e@appjet.AppGeneratedStopException => {
              transaction.commit();
              throw e;
            }
            case (e: org.mozilla.javascript.WrappedException) if 
                (e.getWrappedException == appjet.AppGeneratedStopException) => {
              transaction.commit();
              throw e;
            }
            case e => {
              if (transaction.isActive()) {
                transaction.rollback();
              }
              throw e;
            }
          }
        }
      }
    }
  }
}

import org.mozilla.javascript.{Scriptable, RhinoException};

object execution {
  def executeCodeInNewScope(parentScope: Scriptable, 
                            code: String, name: String, 
                            startLine: Int): Scriptable = {
    val ec = ExecutionContextUtils.currentContext;
    val executable = 
      try {
        BodyLock.compileString(code, name, startLine);
      } catch {
        case e: RhinoException => 
          throw new ExecutionException(
            "Failed to execute code in new scope.", e);
      }
    if (ec == null || ec.scope == null) {
      Thread.dumpStack();
    }
    val rhinoScope = BodyLock.subScope(
      if (parentScope != null) parentScope
      else ec.scope.mainRhinoScope);
    rhinoScope.setParentScope(ec.scope.mainRhinoScope);
    executable.execute(rhinoScope);
    rhinoScope;
  }
}

import org.mozilla.javascript.{Scriptable, Context}

object UnsupportedOperationException extends JSRuntimeException("Unsupported operation.", null);

class ScriptableAdapter extends Scriptable {
  private def unsupported() = throw UnsupportedOperationException;
  def delete(index: Int) { unsupported(); }
  def delete(name: String) { unsupported(); }
  def get(index: Int, start: Scriptable): Object = Context.getUndefinedValue();
  def get(name: String, start: Scriptable): Object = Context.getUndefinedValue();
  def getClassName() = getClass.getName();
  def getDefaultValue(hint: Class[_]) = "[ScriptableAdapter]";
  def getIds(): Array[Object] = Array[Object]();
  def getParentScope: Scriptable = null;
  def getPrototype: Scriptable = null;
  def has(index: Int, start: Scriptable): Boolean = false;
  def has(name: String, start: Scriptable): Boolean = false;
  def hasInstance(instance: Scriptable): Boolean = false;
  def put(index: Int, start: Scriptable, value: Object) { unsupported(); }
  def put(name: String, start: Scriptable, value: Object) { unsupported(); }
  def setParentScope(parent: Scriptable) { unsupported(); }
  def setPrototype(prototype: Scriptable) { unsupported(); }
}

class ProxyObject(
    delete_i: Function1[Int, Unit],
    delete_s: Function1[String, Unit],
    get_i: Function1[Int, Object],
    get_s: Function1[String, Object],
    getIds_f: Function0[Array[Object]],
    has_i: Function1[Int, Boolean],
    has_s: Function1[String, Boolean],
    put_i: Function2[Int, Object, Unit],
    put_s: Function2[String, Object, Unit]) {
  def delete(index: Int) { delete_i(index); }
  def delete(name: String) { delete_s(name); }
  def get(index: Int, start: Scriptable) = get_i(index);
  def get(name: String, start: Scriptable) = get_s(name);
  def getIds() = getIds_f();
  def has(index: Int, start: Scriptable) = has_i(index);
  def has(name: String, start: Scriptable) = has_s(name);
  def put(index: Int, start: Scriptable, value: Object) { put_i(index, value); }
  def put(name: String, start: Scriptable, value: Object) { put_s(name, value); }      
}

// class SerializablePrimitiveObject extends ScriptableAdapter with java.io.Serializable {
//   val stringMap = new java.util.HashMap[String, Serializable]();
//   val intMap = new java.util.HashMap[Int, Serializable]();
// 
//   def delete(index: Int) { intMap.remove(index); }
//   def delete(name: String) { stringMap.remove(name); }
//   def get(index: Int, start: Scriptable): Object = {
//     if (intMap.containsKey(index)) {
//       intMap.get(index);
//     } else {
//       Context.getUndefinedValue();
//     }
//   }
//   def get(name: String, start: Scriptable): Object = {
//     if (stringMap.containsKey(name)) {
//       stringMap.get(name);
//     } else {
//       Context.getUndefinedValue();
//     }
//   }
//   def getClassName() = getClass.getName();
//   def getDefaultValue(hint: Class[_]) = "[ScriptableAdapter]";
//   def getIds(): Array[Object] = {
//     val set = new HashSet[Object];
//     set.addAll(intMap.keySet());
//     set.addAll(stringMap.keySet());
//     set.toArray();
//   }
//   def getParentScope: Scriptable = null;
//   def getPrototype: Scriptable = null;
//   def has(index: Int, start: Scriptable): Boolean = 
//     intMap.containsKey(index);
//   def has(name: String, start: Scriptable): Boolean =
//     stringMap.containsKey(name);
//   def hasInstance(instance: Scriptable): Boolean = false;
//   def put(index: Int, start: Scriptable, value: Object) {
//     intMap.put(index, value);
//   }
//   def put(name: String, start: Scriptable, value: Object) {
//     stringMap.put(index, value);
//   }
//   def setParentScope(parent: Scriptable) { unsupported(); }
//   def setPrototype(prototype: Scriptable) { unsupported(); } 
// }