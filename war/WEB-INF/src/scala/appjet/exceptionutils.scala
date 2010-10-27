package appjet;

// more of a prototype than a class, really
class StackTraceManipulator {
  def filter(elt: StackTraceElement): Boolean = true;
  def map(elt: StackTraceElement): String = 
    "&nbsp; &nbsp; &nbsp; at: "+elt.getClassName()+"."+elt.getMethodName()+"("+elt.getFileName()+":"+elt.getLineNumber()+")<br>";
}

object ExceptionUtils {
  val template = """<html>
<head>
  <title>Server Exception</title>
</head>
<body>
<h3>A server exception occurred.</h3>
%emsg%<br>
%trace%
</body>
</html>
"""
  
  /**
   * Returns an HTML-formatted stack trace.
   */
  def stackTrace(e: Throwable, manip: StackTraceManipulator): String = {
    val emsg = e.getMessage();

    val trace = new StringBuilder();
    appendTrace(trace, e, manip);
    if (e.getCause() != null) {
      appendCauseRecursively(trace, e.getCause(), manip);
    }

    return template.replace("%emsg%", emsg).replace("%trace%", trace.toString())
  }
  
  def javaStackTrace(e: Throwable) = {
    stackTrace(e, new StackTraceManipulator());
  }
  
  def javascriptStackTrace(e: JSRuntimeException): String = {
    stackTrace(
      if (e.getCause() == null) e else e.getCause(),
      new StackTraceManipulator {
        override def filter(elt: StackTraceElement) =
          ((elt.getFileName() ne null) &&
           elt.getFileName().endsWith(".js") && elt.getLineNumber() >= 0);
        override def map(elt: StackTraceElement) = 
          "&nbsp; &nbsp; &nbsp; at: "+elt.getFileName()+":"+elt.getLineNumber()+"<br>"
      });
  }
  
  /**
   * Appends a trace and recurisvely appends the throwable's causes to a stringbuilder.
   */
  def appendCauseRecursively(trace: StringBuilder, e: Throwable, manip: StackTraceManipulator) {
    trace.append("Caused by: "+e.getMessage()+"<br>");
    appendTrace(trace, e, manip);
    if (e.getCause() != null) {
      appendCauseRecursively(trace, e.getCause(), manip);
    }
  }
  
  /**
   * Appends just this throwable's trace to the stringbuilder.
   */
  def appendTrace(trace: StringBuilder, e: Throwable, manip: StackTraceManipulator) {
    for (elt <- e.getStackTrace() if manip.filter(elt)) {
      trace.append(manip.map(elt));
    }
  }
}
