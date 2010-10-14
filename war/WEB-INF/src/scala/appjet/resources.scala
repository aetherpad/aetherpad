package appjet;

import scala.collection.mutable.HashMap;

import java.io.File;

class CachedFile(file: File) {
  protected var dirty = true;
  private var contentsCache: Option[String] = None;
  
  def contents = {
    if (dirty) {
      if (file exists) {
        contentsCache = Some(io.Source fromFile file mkString);
      } else {
        contentsCache = None;
      }
      dirty = false;
    }
    contentsCache;
  }
  
  def reset() {
    dirty = true;
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
  
  def reset() {
    for ((_, lib) <- libs) {
      lib.reset();
    }
  }
}