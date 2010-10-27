package appjet;

import scala.collection.mutable.HashMap;
import scala.collection.mutable.ListBuffer;
import scala.collection.mutable.LinkedHashSet;

import org.mozilla.javascript.Context;
import java.io.ByteArrayOutputStream;
import java.util.concurrent.atomic.AtomicLong;
import java.util.zip.GZIPOutputStream;
import javax.servlet.http.{HttpServletRequest, HttpServletResponse};

object ExecutionContextUtils {
  val uniqueIds = new AtomicLong(0);

  val ecVar = new NoninheritedDynamicVariable[ExecutionContext](null);
  def withContext[E](ec: ExecutionContext)(block: => E): E = {
    ecVar.withValue(ec)(block);
  }
  
  def currentContext = ecVar.value;
}

case class ExecutionContext(
  val request: HttpServletRequest,
  val response: ResponseWrapper,
  var scope: Scope) {

  lazy val attributes = new HashMap[String, Any];
  lazy val executionId = ""+ExecutionContextUtils.uniqueIds.incrementAndGet();
}

class ResponseWrapper(val res: HttpServletResponse) {
  private lazy val outputStrings = new ListBuffer[String];
  private lazy val outputBytes = new ListBuffer[Array[Byte]];
  private var statusCode = 200;
  private var contentType = "text/html";
  private var redirect: String = null;
  private lazy val headers = new LinkedHashSet[(String, String, HttpServletResponse => Unit)] {
    def removeAll(k: String) {
      this.foreach(x => if (x._1 == k) remove(x));
    }
  }

  def overwriteOutputWithError(code: Int, errorStr: String) {
    statusCode = code;
    outputStrings.clear();
    outputStrings += errorStr;
    outputBytes.clear();
    headers.clear();
    Util.noCacheHeaders.foreach(x => headers += (x._1, x._2, res => res.setHeader(x._1, x._2)));
    redirect = null;
    contentType = "text/html; charset=utf-8";
  }

  def reset() {
    outputStrings.clear();
    outputBytes.clear();
    redirect = null;
    headers.clear();
    Util.noCacheHeaders.foreach(x => headers += (x._1, x._2, res => res.setHeader(x._1, x._2)));
    statusCode = 200;
    contentType = "text/html; charset=utf-8";
  }
  def error(code: Int, errorStr: String) {
    overwriteOutputWithError(code, errorStr);
    stop();
  }
  def stop() {
    throw AppGeneratedStopException;
  }

  def write(s: String) {
    outputStrings += s;
  }
  def getOutput() = outputStrings.mkString("");
  def writeBytes(bytes: String) {
    val a = new Array[Byte](bytes.length());
    bytes.getBytes(0, bytes.length(), a, 0);
    outputBytes += a;
  }
  def writeBytes(bytes: Array[Byte]) {
    outputBytes += bytes;
  }
  def getOutputBytes() = outputBytes.flatMap(x => x).toArray
  def setContentType(s: String) {
    contentType = s;
  }
  def getCharacterEncoding() = {
    res.setContentType(contentType);
    res.getCharacterEncoding();
  }
  def setStatusCode(sc: Int) {
    statusCode = sc;
  }
  def getStatusCode() = statusCode;
  def redirect(loc: String) {
    statusCode = 302;
    redirect = loc;
    stop();
  }
  def setHeader(name: String, value: String) {
    headers += ((name, value, res => res.setHeader(name, value)));
  }
  def addHeader(name: String, value: String) {
    headers += ((name, value, res => res.addHeader(name, value)));
  }
  def getHeader(name: String) = {
    headers.filter(_._1 == name).map(_._2).toSeq.toArray;
  }
  def removeHeader(name: String) {
    headers.removeAll(name);
  }

  var gzipOutput = false;
  def setGzip(gzip: Boolean) {
    gzipOutput = gzip;
  }

  def print() {
    if (redirect != null && statusCode == 302) {
      headers.foreach(_._3(res));
      res.sendRedirect(redirect);
    } else {
      res.setStatus(statusCode);
      res.setContentType(contentType);
      headers.foreach(_._3(res));
      if (gzipOutput) res.setHeader("Content-Encoding", "gzip");
      var bytes: Seq[Array[Byte]] = 
      if (outputStrings.length > 0) {
        outputStrings.map(_.getBytes(res.getCharacterEncoding()));
      } else if (outputBytes.length > 0) {
        outputBytes;
      } else {
        Array(Array[Byte]());
      }
      if (gzipOutput) bytes = List(Util.gzip(Array.concat(bytes:_*)));
      res.setContentLength((bytes :\ 0) {_.length + _});
      bytes.foreach(res.getOutputStream.write(_));
    }
  }
}

object AppGeneratedStopException extends JSRuntimeException("User-generated stop.", null);

object rhinosupport {
  def runModuleInNewScope(moduleName: String): Any = {
    val ec = ExecutionContextUtils.currentContext;
    val lib = Libraries.get("WEB-INF/src/ssjs/modules/"+moduleName+".js");
    if (lib.executable.isDefined) {
      val newScope = BodyLock.subScope(ec.scope.parentRhinoScope);
      try {
        lib.executable.get.execute(newScope)        
      } catch {
        case e: ExecutionException => throw e;
        case e => throw new ExecutionException("Error occurred while running module: "+moduleName, e);
      }
      newScope
    } else {
      Context.getUndefinedValue();
    }
  }
  
  val attributes = new HashMap[String, Any];
}

object Util {
  def noCacheHeaders =
    Map("Expires" -> "Sat, 5 Feb 1983 07:07:07 GMT",
        "Last-Modified" -> (new java.util.Date()).toGMTString(),
        "Cache-Control" -> "no-store, no-cache, must-revalidate, max-age=0, post-check=0, pre-check=0",
        "Pragma" -> "no-cache");

  lazy val isProduction =
    System.getProperty("com.google.appengine.runtime.environment") == "Production";

  def gzip(bytes: Array[Byte]): Array[Byte] = {
    if (bytes.length == 0) {
      bytes;
    } else {
      val baos = new ByteArrayOutputStream();
      val gzos = new GZIPOutputStream(baos);
      gzos.write(bytes, 0, bytes.length);
      gzos.close();
      baos.toByteArray();
    }
  }
}
