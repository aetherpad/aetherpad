package aetherpad;

import java.io.IOException;
import javax.servlet.http._;

import appjet.{BodyLock, Executable, Libraries, ScopeManager, ExecutionContext, ResponseWrapper, ExecutionContextUtils, ExceptionUtils};

class AppJetEngineServlet extends HttpServlet {
  override def doGet(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }
  override def doPost(req: HttpServletRequest, res: HttpServletResponse) {
    execute(req, res);
  }
  
  val requestLib = Libraries.get("WEB-INF/src/ssjs/onrequest.js")
  
  def execute(req: HttpServletRequest, res: HttpServletResponse) {
    ScopeManager.withScope { scope =>
      val ec = ExecutionContext(req, new ResponseWrapper(res), scope);
      try {
        ExecutionContextUtils.withContext(ec) {
          requestLib.executable.get.execute(BodyLock.subScope(scope.mainRhinoScope));
        }      
      } catch {
        case appjet.AppGeneratedStopException => { }
        case e: appjet.JSRuntimeException => {
          ec.response.overwriteOutputWithError(500, ExceptionUtils.javascriptStackTrace(e));
        }
        case e: Throwable => {
          ec.response.overwriteOutputWithError(500, ExceptionUtils.javaStackTrace(e));
        }
      } finally {
        ec.response.print();      
      }
    }
  }
}

