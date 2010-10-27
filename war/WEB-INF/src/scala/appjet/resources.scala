package appjet;

import scala.collection.mutable.HashMap;

import java.io.File;

class CachedFile(file: File) {
  protected var dirty = true;
  private var contentsCache: Option[String] = None;
  private var lastModified: Option[Long] = None;
  
  def contents = {
    if (dirty) {
      if (file exists) {
        contentsCache = Some(io.Source fromFile file mkString);
        if (!Util.isProduction) {
          lastModified = Some(file.lastModified());
        }
      } else {
        contentsCache = None;
        lastModified = None;
      }
      dirty = false;
    }
    contentsCache;
  }
  
  def reset() {
    dirty = true;
  }

  def isModified: Boolean = {
    if (Util.isProduction) {
      false;
    } else {
      if (file exists) {
        file.lastModified() > lastModified.getOrElse(0L);
      } else {
        lastModified.isDefined;
      }
    }
  }
}

class Library(file: File) extends CachedFile(file) {
  private var executableCache: Option[Executable] = None;
  
  def executable = {
    if (dirty) {
      executableCache = contents.map(BodyLock compileString (_, file.getPath(), 1))
      dirty = false
    }
    executableCache
  }
}

object Libraries {
  private val libs = new HashMap[String, Library];
  private def createLibrary(modulePath: String) = 
    new Library(new File(modulePath))
  
  def get(modulePath: String) =
    libs.getOrElseUpdate(modulePath, createLibrary(modulePath));
  
  def checkAllModifications() = {
    if (!Util.isProduction) {
      var doReset = false;
      for ((_, lib) <- libs) {
        if (lib.isModified) {
          doReset = true;
          lib.reset();
        }
      }
      if (doReset) {
        ScopeManager.reset();
      }
    }
  }
}